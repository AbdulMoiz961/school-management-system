import { ClassSection } from "../models/ClassSection.js";
import type { ClassSectionDocument } from "../models/ClassSection.js";
import { Student } from "../models/Student.js";
import { Term } from "../models/Term.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { ClassSection as ClassSectionDTO, ListQuery } from "@sms/shared";
import type { z } from "zod";
import type { createClassSchema, updateClassSchema } from "../validators/academic.validator.js";

type CreateInput = z.infer<typeof createClassSchema>;
type UpdateInput = z.infer<typeof updateClassSchema>;

export const CLASS_SORT_FIELDS = ["gradeLevel", "section", "capacity", "createdAt"] as const;

/** Reads a populated-or-raw ref and returns its string id. */
function refId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
  return String(value);
}

export function toClassSection(
  doc: ClassSectionDocument,
  extras: { teacherName?: string; studentCount?: number } = {},
): ClassSectionDTO {
  const result: ClassSectionDTO = {
    id: String(doc._id),
    gradeLevel: doc.gradeLevel,
    section: doc.section,
    capacity: doc.capacity,
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
  };
  const ct = refId(doc.classTeacherId);
  if (ct) result.classTeacherId = ct;
  if (extras.teacherName) result.classTeacherName = extras.teacherName;
  const tid = refId(doc.termId);
  if (tid) result.termId = tid;
  if (extras.studentCount !== undefined) result.studentCount = extras.studentCount;
  return result;
}

/** Display label used in audit entries and dropdowns: "Grade 10 A". */
export function classLabel(doc: { gradeLevel: string; section: string }): string {
  return `${doc.gradeLevel} ${doc.section}`;
}

/** Human name for a teacher user id, if one is assigned. */
async function teacherNameFor(userId: unknown): Promise<string | undefined> {
  const id = refId(userId);
  if (!id) return undefined;
  const user = await User.findById(id).select("firstName lastName");
  return user ? `${user.firstName} ${user.lastName}` : undefined;
}

/** Student counts for a set of classes, in one query rather than N. */
async function studentCountsFor(ids: unknown[]): Promise<Map<string, number>> {
  const rows = await Student.aggregate<{ _id: unknown; count: number }>([
    { $match: { classSectionId: { $in: ids }, isActive: true } },
    { $group: { _id: "$classSectionId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export async function listClasses(query: ListQuery) {
  const opts = buildListOptions(query, CLASS_SORT_FIELDS, "gradeLevel");
  const filter: Record<string, unknown> = {
    ...searchFilter(query.search, ["gradeLevel", "section"]),
  };
  if (!query.includeInactive) filter.isActive = true;

  const { docs, pagination } = await paginateModel<ClassSectionDocument>(ClassSection, filter, opts);

  // Enrich with teacher names and student counts without N+1 queries.
  const counts = await studentCountsFor(docs.map((d) => d._id));
  const teacherIds = [...new Set(docs.map((d) => refId(d.classTeacherId)).filter(Boolean))];
  const teachers = await User.find({ _id: { $in: teacherIds } }).select("firstName lastName");
  const teacherMap = new Map(
    teachers.map((t) => [String(t._id), `${t.firstName} ${t.lastName}`]),
  );

  const items = docs.map((d) => {
    const tid = refId(d.classTeacherId);
    return toClassSection(d, {
      teacherName: tid ? teacherMap.get(tid) : undefined,
      studentCount: counts.get(String(d._id)) ?? 0,
    });
  });

  return { items, pagination };
}

export async function getClassSection(id: string): Promise<ClassSectionDTO> {
  const doc = await ClassSection.findById(id);
  if (!doc) throw ApiError.notFound("Class not found");

  const counts = await studentCountsFor([doc._id]);
  const teacherName = await teacherNameFor(doc.classTeacherId);
  return toClassSection(doc, {
    studentCount: counts.get(String(doc._id)) ?? 0,
    ...(teacherName ? { teacherName } : {}),
  });
}

/** Validates that referenced teacher/term ids actually exist. */
async function assertRefs(input: { classTeacherId?: string; termId?: string }): Promise<void> {
  if (input.classTeacherId) {
    const teacher = await User.findOne({ _id: input.classTeacherId, role: "teacher" });
    if (!teacher) throw ApiError.badRequest("The selected class teacher does not exist");
  }
  if (input.termId) {
    const term = await Term.findById(input.termId);
    if (!term) throw ApiError.badRequest("The selected term does not exist");
  }
}

export async function createClassSection(
  input: CreateInput,
  actor: AuditActor,
): Promise<ClassSectionDTO> {
  const clash = await ClassSection.findOne({
    gradeLevel: input.gradeLevel,
    section: input.section.toUpperCase(),
    termId: input.termId || undefined,
  });
  if (clash) {
    throw ApiError.conflict(
      `Class "${input.gradeLevel} ${input.section.toUpperCase()}" already exists for this term`,
    );
  }

  await assertRefs(input);

  const doc = await ClassSection.create({
    gradeLevel: input.gradeLevel,
    section: input.section,
    capacity: input.capacity,
    classTeacherId: input.classTeacherId || undefined,
    termId: input.termId || undefined,
  });

  await audit.created(actor, {
    resource: "ClassSection",
    resourceId: String(doc._id),
    resourceLabel: classLabel(doc),
  });

  return toClassSection(doc);
}

export async function updateClassSection(
  id: string,
  input: UpdateInput,
  actor: AuditActor,
): Promise<ClassSectionDTO> {
  const doc = await ClassSection.findById(id);
  if (!doc) throw ApiError.notFound("Class not found");

  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.gradeLevel || input.section || input.termId !== undefined) {
    const gradeLevel = input.gradeLevel ?? doc.gradeLevel;
    const section = (input.section ?? doc.section).toUpperCase();
    const termId = input.termId !== undefined ? input.termId || undefined : doc.termId;
    const clash = await ClassSection.findOne({
      gradeLevel,
      section,
      termId,
      _id: { $ne: doc._id },
    });
    if (clash) throw ApiError.conflict(`Class "${gradeLevel} ${section}" already exists for this term`);
  }

  await assertRefs(input);

  // Reducing capacity below current enrolment would orphan students.
  if (input.capacity !== undefined && input.capacity < doc.capacity) {
    const enrolled = await Student.countDocuments({ classSectionId: doc._id, isActive: true });
    if (input.capacity < enrolled) {
      throw ApiError.badRequest(
        `Capacity cannot be lower than the ${enrolled} student${enrolled === 1 ? "" : "s"} already assigned`,
      );
    }
  }

  if (input.gradeLevel !== undefined) doc.gradeLevel = input.gradeLevel;
  if (input.section !== undefined) doc.section = input.section;
  if (input.capacity !== undefined) doc.capacity = input.capacity;
  if (input.classTeacherId !== undefined) {
    doc.classTeacherId = (input.classTeacherId || undefined) as never;
  }
  if (input.termId !== undefined) doc.termId = (input.termId || undefined) as never;
  if (input.isActive !== undefined) doc.isActive = input.isActive;

  await doc.save();

  await audit.updated(
    actor,
    { resource: "ClassSection", resourceId: String(doc._id), resourceLabel: classLabel(doc) },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return getClassSection(String(doc._id));
}

export async function deleteClassSection(id: string, actor: AuditActor): Promise<void> {
  const doc = await ClassSection.findById(id);
  if (!doc) throw ApiError.notFound("Class not found");

  const enrolled = await Student.countDocuments({ classSectionId: doc._id, isActive: true });
  if (enrolled > 0) {
    throw ApiError.badRequest(
      `Cannot delete this class: ${enrolled} student${enrolled === 1 ? " is" : "s are"} still assigned. ` +
        `Move them to another class first.`,
    );
  }

  const { Subject } = await import("../models/Subject.js");
  const subjects = await Subject.countDocuments({ classSectionId: doc._id, isActive: true });
  if (subjects > 0) {
    throw ApiError.badRequest(
      `Cannot delete this class: ${subjects} subject${subjects === 1 ? "" : "s"} still reference it.`,
    );
  }

  await doc.deleteOne();
  await audit.deleted(actor, {
    resource: "ClassSection",
    resourceId: id,
    resourceLabel: classLabel(doc),
  });
}
