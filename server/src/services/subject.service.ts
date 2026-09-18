import { Subject, type SubjectDocument } from "../models/Subject.js";
import { ClassSection } from "../models/ClassSection.js";
import { User } from "../models/User.js";
import { Term } from "../models/Term.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { Subject as SubjectDTO, ListQuery } from "@sms/shared";
import type { z } from "zod";
import type { createSubjectSchema, updateSubjectSchema } from "../validators/academic.validator.js";

type CreateInput = z.infer<typeof createSubjectSchema>;
type UpdateInput = z.infer<typeof updateSubjectSchema>;

export const SUBJECT_SORT_FIELDS = ["name", "code", "creditHours", "createdAt"] as const;

function refId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
  return String(value);
}

export function toSubject(
  doc: SubjectDocument,
  extras: { className?: string; teacherName?: string } = {},
): SubjectDTO {
  const result: SubjectDTO = {
    id: String(doc._id),
    name: doc.name,
    code: doc.code,
    creditHours: doc.creditHours,
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
  };
  const cid = refId(doc.classSectionId);
  if (cid) result.classSectionId = cid;
  if (extras.className) result.classSectionName = extras.className;
  const tid = refId(doc.teacherId);
  if (tid) result.teacherId = tid;
  if (extras.teacherName) result.teacherName = extras.teacherName;
  const term = refId(doc.termId);
  if (term) result.termId = term;
  return result;
}

async function assertRefs(input: {
  classSectionId?: string;
  teacherId?: string;
  termId?: string;
}): Promise<void> {
  if (input.classSectionId) {
    const cls = await ClassSection.findById(input.classSectionId);
    if (!cls) throw ApiError.badRequest("The selected class does not exist");
  }
  if (input.teacherId) {
    const teacher = await User.findOne({ _id: input.teacherId, role: "teacher" });
    if (!teacher) throw ApiError.badRequest("The selected teacher does not exist");
  }
  if (input.termId) {
    const term = await Term.findById(input.termId);
    if (!term) throw ApiError.badRequest("The selected term does not exist");
  }
}

/** Enriches a page of subjects with class and teacher names in O(1) queries. */
async function enrich(docs: SubjectDocument[]): Promise<SubjectDTO[]> {
  const classIds = [...new Set(docs.map((d) => refId(d.classSectionId)).filter(Boolean))];
  const teacherIds = [...new Set(docs.map((d) => refId(d.teacherId)).filter(Boolean))];

  const [classes, teachers] = await Promise.all([
    ClassSection.find({ _id: { $in: classIds } }).select("gradeLevel section"),
    User.find({ _id: { $in: teacherIds } }).select("firstName lastName"),
  ]);

  const classMap = new Map(
    classes.map((c) => [String(c._id), `${c.gradeLevel} ${c.section}`.trim()]),
  );
  const teacherMap = new Map(teachers.map((t) => [String(t._id), `${t.firstName} ${t.lastName}`]));

  return docs.map((d) => {
    const cid = refId(d.classSectionId);
    const tid = refId(d.teacherId);
    return toSubject(d, {
      ...(cid && classMap.get(cid) ? { className: classMap.get(cid)! } : {}),
      ...(tid && teacherMap.get(tid) ? { teacherName: teacherMap.get(tid)! } : {}),
    });
  });
}

export async function listSubjects(query: ListQuery) {
  const opts = buildListOptions(query, SUBJECT_SORT_FIELDS, "code");
  const filter: Record<string, unknown> = {
    ...searchFilter(query.search, ["name", "code"]),
  };
  if (!query.includeInactive) filter.isActive = true;

  const { docs, pagination } = await paginateModel<SubjectDocument>(Subject, filter, opts);
  return { items: await enrich(docs), pagination };
}

export async function getSubject(id: string): Promise<SubjectDTO> {
  const doc = await Subject.findById(id);
  if (!doc) throw ApiError.notFound("Subject not found");
  const [dto] = await enrich([doc]);
  return dto!;
}

/** Subjects taught by or assigned to a specific teacher user id. */
export async function listSubjectsForTeacher(teacherUserId: string) {
  const docs = await Subject.find({ teacherId: teacherUserId, isActive: true }).sort({ code: 1 });
  return enrich(docs);
}

export async function createSubject(input: CreateInput, actor: AuditActor): Promise<SubjectDTO> {
  const code = input.code.toUpperCase();
  const clash = await Subject.findOne({ code, termId: input.termId || undefined });
  if (clash) throw ApiError.conflict(`A subject with code "${code}" already exists for this term`);

  await assertRefs(input);

  const doc = await Subject.create({
    name: input.name,
    code,
    creditHours: input.creditHours,
    classSectionId: input.classSectionId || undefined,
    teacherId: input.teacherId || undefined,
    termId: input.termId || undefined,
  });

  await audit.created(actor, {
    resource: "Subject",
    resourceId: String(doc._id),
    resourceLabel: `${doc.code} — ${doc.name}`,
  });

  return getSubject(String(doc._id));
}

export async function updateSubject(
  id: string,
  input: UpdateInput,
  actor: AuditActor,
): Promise<SubjectDTO> {
  const doc = await Subject.findById(id);
  if (!doc) throw ApiError.notFound("Subject not found");

  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.code || input.termId !== undefined) {
    const code = (input.code ?? doc.code).toUpperCase();
    const termId = input.termId !== undefined ? input.termId || undefined : doc.termId;
    const clash = await Subject.findOne({ code, termId, _id: { $ne: doc._id } });
    if (clash) throw ApiError.conflict(`A subject with code "${code}" already exists for this term`);
  }

  await assertRefs(input);

  if (input.name !== undefined) doc.name = input.name;
  if (input.code !== undefined) doc.code = input.code;
  if (input.creditHours !== undefined) doc.creditHours = input.creditHours;
  if (input.classSectionId !== undefined) {
    doc.classSectionId = (input.classSectionId || undefined) as never;
  }
  if (input.teacherId !== undefined) doc.teacherId = (input.teacherId || undefined) as never;
  if (input.termId !== undefined) doc.termId = (input.termId || undefined) as never;
  if (input.isActive !== undefined) doc.isActive = input.isActive;

  await doc.save();

  await audit.updated(
    actor,
    { resource: "Subject", resourceId: String(doc._id), resourceLabel: `${doc.code} — ${doc.name}` },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return getSubject(String(doc._id));
}

export async function deleteSubject(id: string, actor: AuditActor): Promise<void> {
  const doc = await Subject.findById(id);
  if (!doc) throw ApiError.notFound("Subject not found");

  await doc.deleteOne();
  await audit.deleted(actor, {
    resource: "Subject",
    resourceId: id,
    resourceLabel: `${doc.code} — ${doc.name}`,
  });
}
