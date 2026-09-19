import { Attendance, toDayStart } from "../models/Attendance.js";
import { Student } from "../models/Student.js";
import { Subject } from "../models/Subject.js";
import { ClassSection } from "../models/ClassSection.js";
import { ApiError } from "../utils/ApiError.js";
import { audit, type AuditActor } from "./audit.service.js";
import { buildListOptions, paginateModel } from "../utils/query.js";
import type {
  AttendanceRecord,
  AttendanceRegisterView,
  AttendanceSummary,
  ListQuery,
} from "@sms/shared";
import type { MarkRegisterInput } from "../validators/attendance.validator.js";

/** Rolls up raw records into the totals/percentage the UI displays. */
export function summarise(
  studentId: string,
  records: { status: string }[],
): AttendanceSummary {
  const totals = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records) {
    if (r.status in totals) totals[r.status as keyof typeof totals] += 1;
  }
  const total = records.length;
  // "Late" still counts as attending, so it is included in the numerator.
  const attended = totals.present + totals.late;
  return {
    studentId,
    total,
    present: totals.present,
    absent: totals.absent,
    late: totals.late,
    excused: totals.excused,
    percentage: total === 0 ? 0 : Math.round((attended / total) * 1000) / 10,
  };
}

function toRecord(doc: {
  _id: unknown;
  studentId: unknown;
  subjectId: unknown;
  date: Date;
  status: string;
  note?: string;
  markedBy: unknown;
  createdAt: Date;
}): AttendanceRecord {
  return {
    id: String(doc._id),
    studentId: String(doc.studentId),
    subjectId: String(doc.subjectId),
    date: doc.date.toISOString(),
    status: doc.status as AttendanceRecord["status"],
    ...(doc.note ? { note: doc.note } : {}),
    markedBy: String(doc.markedBy),
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Returns the register for a subject + date: every enrolled student, pre-filled
 * with any existing mark. This is what the teacher's marking screen loads, so it
 * works identically for "mark" and "edit".
 */
export async function getRegister(
  subjectId: string,
  date: string,
): Promise<AttendanceRegisterView> {
  const subject = await Subject.findById(subjectId);
  if (!subject) throw ApiError.notFound("Subject not found");

  if (!subject.classSectionId) {
    throw ApiError.badRequest("This subject is not assigned to a class, so it has no register");
  }

  const day = toDayStart(date);

  const [students, existing, cls] = await Promise.all([
    Student.find({ classSectionId: subject.classSectionId, isActive: true })
      .sort({ lastName: 1, firstName: 1 })
      .select("rollNumber firstName lastName")
      .lean(),
    Attendance.find({ subjectId, date: day }).lean(),
    ClassSection.findById(subject.classSectionId).select("gradeLevel section").lean(),
  ]);

  const byStudent = new Map(existing.map((r) => [String(r.studentId), r]));

  const rows = students.map((s) => {
    const found = byStudent.get(String(s._id));
    return {
      studentId: String(s._id),
      rollNumber: s.rollNumber,
      name: `${s.firstName} ${s.lastName}`.trim(),
      // Default to present — the common case — so a teacher only changes exceptions.
      status: (found?.status ?? "present") as AttendanceRegisterView["rows"][number]["status"],
    };
  });

  return {
    subjectId,
    subjectName: subject.name,
    ...(subject.classSectionId ? { classSectionId: String(subject.classSectionId) } : {}),
    ...(cls ? { className: `${cls.gradeLevel} ${cls.section}`.trim() } : {}),
    date: day.toISOString(),
    rows,
    alreadyMarked: existing.length > 0,
  };
}

/** True when the actor is allowed to mark this subject's register. */
async function assertCanMark(
  subjectId: string,
  actor: { role: string; id: string },
): Promise<{ classSectionId?: string }> {
  const subject = await Subject.findById(subjectId);
  if (!subject) throw ApiError.notFound("Subject not found");

  // Admins may mark any register; teachers only their own subjects.
  if (actor.role === "teacher" && String(subject.teacherId ?? "") !== actor.id) {
    throw ApiError.forbidden("You can only mark attendance for subjects you teach");
  }

  return subject.classSectionId ? { classSectionId: String(subject.classSectionId) } : {};
}

/**
 * Marks (or re-marks) a whole class register in one call.
 *
 * Uses a bulk upsert so a teacher editing a register updates existing rows
 * rather than hitting the unique index. Atomic per row.
 */
export async function markRegister(
  input: MarkRegisterInput,
  actor: AuditActor & { role: string; id: string },
): Promise<{ marked: number; created: number; updated: number }> {
  const { classSectionId } = await assertCanMark(input.subjectId, actor);
  const day = toDayStart(input.date);

  // Every student in the submission must actually be enrolled in this class —
  // otherwise a crafted request could attach attendance to any student.
  if (classSectionId) {
    const enrolled = await Student.find({
      _id: { $in: input.entries.map((e) => e.studentId) },
      classSectionId,
      isActive: true,
    }).select("_id");
    const valid = new Set(enrolled.map((s) => String(s._id)));
    const invalid = input.entries.filter((e) => !valid.has(e.studentId));
    if (invalid.length > 0) {
      throw ApiError.badRequest(
        `${invalid.length} student(s) in this register are not enrolled in the subject's class`,
      );
    }
  }

  const before = await Attendance.countDocuments({
    subjectId: input.subjectId,
    date: day,
  });

  const operations: Parameters<typeof Attendance.bulkWrite>[0] = input.entries.map((e) => ({
    updateOne: {
      filter: { studentId: e.studentId, subjectId: input.subjectId, date: day },
      update: {
        $set: {
          status: e.status,
          ...(e.note !== undefined ? { note: e.note } : {}),
          markedBy: actor.id,
          ...(classSectionId ? { classSectionId } : {}),
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(operations, { ordered: false });
  const created = result.upsertedCount;
  const updated = result.modifiedCount;

  await audit.created(actor, {
    resource: "Attendance",
    resourceId: String(input.subjectId),
    resourceLabel: `Register ${input.date} · ${input.entries.length} students`,
  });

  return { marked: input.entries.length, created, updated: before > 0 ? updated : 0 };
}

export async function getSummary(
  studentId: string,
  filters: { from?: string; to?: string; subjectId?: string } = {},
): Promise<AttendanceSummary> {
  const query: Record<string, unknown> = { studentId };
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.from || filters.to) {
    query.date = {
      ...(filters.from ? { $gte: toDayStart(filters.from) } : {}),
      ...(filters.to ? { $lte: toDayStart(filters.to) } : {}),
    };
  }

  const records = await Attendance.find(query).select("status").lean();
  return summarise(studentId, records);
}

/** Summaries for every student in a class — one aggregate, not N queries. */
export async function getClassSummaries(
  classSectionId: string,
  filters: { from?: string; to?: string } = {},
): Promise<AttendanceSummary[]> {
  const students = await Student.find({ classSectionId, isActive: true }).select("_id").lean();
  const ids = students.map((s) => s._id);

  const match: Record<string, unknown> = { studentId: { $in: ids } };
  if (filters.from || filters.to) {
    match.date = {
      ...(filters.from ? { $gte: toDayStart(filters.from) } : {}),
      ...(filters.to ? { $lte: toDayStart(filters.to) } : {}),
    };
  }

  const rows = await Attendance.aggregate<{ _id: { student: unknown; status: string }; count: number }>([
    { $match: match },
    { $group: { _id: { student: "$studentId", status: "$status" }, count: { $sum: 1 } } },
  ]);

  // Bucket the aggregate output per student.
  const perStudent = new Map<string, { status: string }[]>();
  for (const s of students) perStudent.set(String(s._id), []);
  for (const row of rows) {
    const key = String(row._id.student);
    const bucket = perStudent.get(key);
    if (!bucket) continue;
    for (let i = 0; i < row.count; i++) bucket.push({ status: row._id.status });
  }

  return [...perStudent.entries()].map(([id, recs]) => summarise(id, recs));
}

/** Paginated raw history, for a student's own view or an admin audit. */
export async function listHistory(query: ListQuery & { studentId?: string; subjectId?: string; from?: string; to?: string }) {
  const opts = buildListOptions(query, ["date", "status", "createdAt"], "-date");
  const filter: Record<string, unknown> = {};
  if (query.studentId) filter.studentId = query.studentId;
  if (query.subjectId) filter.subjectId = query.subjectId;
  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: toDayStart(query.from) } : {}),
      ...(query.to ? { $lte: toDayStart(query.to) } : {}),
    };
  }

  const { docs, pagination } = await paginateModel<
    Parameters<typeof toRecord>[0] & { _id: unknown }
  >(Attendance, filter, opts);

  return { items: docs.map(toRecord), pagination };
}
