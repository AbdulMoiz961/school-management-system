import { TimetableSlot, timeToMinutes, minutesToTime } from "../models/TimetableSlot.js";
import { ClassSection } from "../models/ClassSection.js";
import { Subject } from "../models/Subject.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { audit, type AuditActor } from "./audit.service.js";
import type {
  ConflictCheckResult,
  TimetableConflict,

  TimetableSlotView,
  Weekday,
} from "@sms/shared";
import type { z } from "zod";
import type { createSlotSchema, updateSlotSchema } from "../validators/attendance.validator.js";

type CreateInput = z.infer<typeof createSlotSchema>;
type UpdateInput = z.infer<typeof updateSlotSchema>;

/**
 * Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd).
 *
 * Half-open is the correct model for a timetable — a lesson ending at 10:00 and
 * the next starting at 10:00 are adjacent, not overlapping. Using closed
 * intervals would reject back-to-back lessons.
 */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Finds every clash a proposed slot would cause.
 *
 * Three independent constraints:
 *   1. the teacher cannot be in two places at once
 *   2. the class cannot be in two lessons at once
 *   3. the slot must not duplicate an existing class/day/start exactly
 *
 * `excludeSlotId` lets an update ignore the row it is replacing.
 */
export async function detectConflicts(
  input: { teacherId: string; classSectionId: string; day: Weekday; startTime: string; endTime: string },
  excludeSlotId?: string,
): Promise<TimetableConflict[]> {
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);

  // Fetch everything scheduled that day for either the teacher or the class,
  // then compare in memory. Cheaper and clearer than two range queries.
  const sameDay = await TimetableSlot.find({
    day: input.day,
    ...(excludeSlotId ? { _id: { $ne: excludeSlotId } } : {}),
    $or: [{ teacherId: input.teacherId }, { classSectionId: input.classSectionId }],
  })
    .populate<{ subjectId: { name: string; code: string } }>("subjectId", "name code")
    .lean();

  const conflicts: TimetableConflict[] = [];

  for (const slot of sameDay) {
    if (!overlaps(start, end, slot.startMinutes, slot.endMinutes)) continue;

    const slotId = String(slot._id);
    const window = `${minutesToTime(slot.startMinutes)}–${minutesToTime(slot.endMinutes)}`;
    const subject = slot.subjectId as unknown as { name: string; code: string } | null;
    const label = subject ? `${subject.code} (${subject.name})` : "another lesson";

    if (String(slot.teacherId) === input.teacherId) {
      conflicts.push({
        kind: "teacher",
        message: `This teacher already has ${label} at ${window} on ${input.day}.`,
        conflictingSlotIds: [slotId],
      });
    }

    if (String(slot.classSectionId) === input.classSectionId) {
      conflicts.push({
        kind: "class",
        message: `This class already has ${label} at ${window} on ${input.day}.`,
        conflictingSlotIds: [slotId],
      });
    }
  }

  return conflicts;
}

/** Pre-flight check the UI can call before attempting a save. */
export async function checkConflicts(input: {
  teacherId: string;
  classSectionId: string;
  day: Weekday;
  startTime: string;
  endTime: string;
  excludeSlotId?: string;
}): Promise<ConflictCheckResult> {
  const conflicts = await detectConflicts(input, input.excludeSlotId);
  return { hasConflict: conflicts.length > 0, conflicts };
}

/** Attaches display names so the UI never resolves ids itself. */
async function enrich(slots: TimetableSlotDocumentLike[]): Promise<TimetableSlotView[]> {
  const classIds = [...new Set(slots.map((s) => String(s.classSectionId)))];
  const subjectIds = [...new Set(slots.map((s) => String(s.subjectId)))];
  const teacherIds = [...new Set(slots.map((s) => String(s.teacherId)))];

  const [classes, subjects, teachers] = await Promise.all([
    ClassSection.find({ _id: { $in: classIds } }).select("gradeLevel section").lean(),
    Subject.find({ _id: { $in: subjectIds } }).select("name code").lean(),
    User.find({ _id: { $in: teacherIds } }).select("firstName lastName").lean(),
  ]);

  const classMap = new Map(classes.map((c) => [String(c._id), `${c.gradeLevel} ${c.section}`.trim()]));
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));
  const teacherMap = new Map(
    teachers.map((t) => [String(t._id), `${t.firstName} ${t.lastName}`.trim()]),
  );

  return slots.map((s) => {
    const subj = subjectMap.get(String(s.subjectId));
    return {
      id: String(s._id),
      classSectionId: String(s.classSectionId),
      subjectId: String(s.subjectId),
      teacherId: String(s.teacherId),
      day: s.day,
      startTime: minutesToTime(s.startMinutes),
      endTime: minutesToTime(s.endMinutes),
      subjectName: subj?.name ?? "Unknown subject",
      subjectCode: subj?.code ?? "—",
      teacherName: teacherMap.get(String(s.teacherId)) ?? "Unknown teacher",
      className: classMap.get(String(s.classSectionId)) ?? "Unknown class",
    };
  });
}

interface TimetableSlotDocumentLike {
  _id: unknown;
  classSectionId: unknown;
  subjectId: unknown;
  teacherId: unknown;
  day: Weekday;
  startMinutes: number;
  endMinutes: number;
}

/** Slots for a class (optionally filtered to one day), sorted chronologically. */
export async function listSlotsForClass(
  classSectionId: string,
  day?: Weekday,
): Promise<TimetableSlotView[]> {
  const slots = await TimetableSlot.find({
    classSectionId,
    ...(day ? { day } : {}),
  })
    .sort({ day: 1, startMinutes: 1 })
    .lean();

  return enrich(slots as unknown as TimetableSlotDocumentLike[]);
}

/** A teacher's own schedule. */
export async function listSlotsForTeacher(
  teacherUserId: string,
  day?: Weekday,
): Promise<TimetableSlotView[]> {
  const slots = await TimetableSlot.find({
    teacherId: teacherUserId,
    ...(day ? { day } : {}),
  })
    .sort({ day: 1, startMinutes: 1 })
    .lean();

  return enrich(slots as unknown as TimetableSlotDocumentLike[]);
}

/** Resolves a teacher's User id from a Subject, used to validate slot creation. */
async function resolveSubject(subjectId: string) {
  const subject = await Subject.findById(subjectId);
  if (!subject) throw ApiError.badRequest("The selected subject does not exist");
  if (!subject.isActive) throw ApiError.badRequest("The selected subject is no longer active");
  return subject;
}

export async function createSlot(
  input: CreateInput,
  actor: AuditActor,
): Promise<TimetableSlotView> {
  const subject = await resolveSubject(input.subjectId);

  // Verify referenced entities exist before reporting conflicts, so a bad id
  // produces "does not exist" rather than a confusing clash message.
  const [cls, teacher] = await Promise.all([
    ClassSection.findById(input.classSectionId),
    User.findOne({ _id: input.teacherId, role: "teacher" }),
  ]);
  if (!cls) throw ApiError.badRequest("The selected class does not exist");
  if (!teacher) throw ApiError.badRequest("The selected teacher does not exist");

  const conflicts = await detectConflicts({
    teacherId: input.teacherId,
    classSectionId: input.classSectionId,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
  });

  if (conflicts.length > 0) {
    // 409 with the specific clashes — the UI shows these inline.
    throw new ApiError(409, conflicts.map((c) => c.message).join(" "), {
      code: "TIMETABLE_CONFLICT",
    });
  }

  const doc = await TimetableSlot.create({
    classSectionId: input.classSectionId,
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    day: input.day,
    startMinutes: timeToMinutes(input.startTime),
    endMinutes: timeToMinutes(input.endTime),
  });

  await audit.created(actor, {
    resource: "TimetableSlot",
    resourceId: String(doc._id),
    resourceLabel: `${subject.code} · ${cls.gradeLevel} ${cls.section} · ${input.day} ${input.startTime}`,
  });

  const [view] = await enrich([doc.toObject() as unknown as TimetableSlotDocumentLike]);
  return view!;
}

export async function updateSlot(
  id: string,
  input: UpdateInput,
  actor: AuditActor,
): Promise<TimetableSlotView> {
  const doc = await TimetableSlot.findById(id);
  if (!doc) throw ApiError.notFound("Timetable slot not found");

  const merged = {
    classSectionId: input.classSectionId ?? String(doc.classSectionId),
    subjectId: input.subjectId ?? String(doc.subjectId),
    teacherId: input.teacherId ?? String(doc.teacherId),
    day: input.day ?? doc.day,
    startTime: input.startTime ?? minutesToTime(doc.startMinutes),
    endTime: input.endTime ?? minutesToTime(doc.endMinutes),
  };

  await resolveSubject(merged.subjectId);

  const conflicts = await detectConflicts(
    {
      teacherId: merged.teacherId,
      classSectionId: merged.classSectionId,
      day: merged.day,
      startTime: merged.startTime,
      endTime: merged.endTime,
    },
    id, // ignore this row when checking, or it would conflict with itself
  );

  if (conflicts.length > 0) {
    throw new ApiError(409, conflicts.map((c) => c.message).join(" "), {
      code: "TIMETABLE_CONFLICT",
    });
  }

  const before = doc.toObject() as unknown as Record<string, unknown>;

  doc.classSectionId = merged.classSectionId as never;
  doc.subjectId = merged.subjectId as never;
  doc.teacherId = merged.teacherId as never;
  doc.day = merged.day;
  doc.startMinutes = timeToMinutes(merged.startTime);
  doc.endMinutes = timeToMinutes(merged.endTime);
  await doc.save();

  await audit.updated(
    actor,
    {
      resource: "TimetableSlot",
      resourceId: String(doc._id),
      resourceLabel: `${merged.day} ${merged.startTime}`,
    },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  const [view] = await enrich([doc.toObject() as unknown as TimetableSlotDocumentLike]);
  return view!;
}

export async function deleteSlot(id: string, actor: AuditActor): Promise<void> {
  const doc = await TimetableSlot.findById(id);
  if (!doc) throw ApiError.notFound("Timetable slot not found");

  await doc.deleteOne();
  await audit.deleted(actor, {
    resource: "TimetableSlot",
    resourceId: id,
    resourceLabel: `${doc.day} ${minutesToTime(doc.startMinutes)}`,
  });
}
