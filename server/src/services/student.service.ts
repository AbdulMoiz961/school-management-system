import { Student, type StudentDocument } from "../models/Student.js";
import { User } from "../models/User.js";
import { ClassSection } from "../models/ClassSection.js";
import { Term } from "../models/Term.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { nextStudentRollNumber } from "../models/Counter.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { Student as StudentDTO, ListQuery } from "@sms/shared";
import type { z } from "zod";
import type {
  createStudentSchema,
  studentAdminUpdateSchema,
  studentSelfUpdateSchema,
} from "../validators/academic.validator.js";

type CreateInput = z.infer<typeof createStudentSchema>;
type AdminUpdateInput = z.infer<typeof studentAdminUpdateSchema>;
type SelfUpdateInput = z.infer<typeof studentSelfUpdateSchema>;

export const STUDENT_SORT_FIELDS = [
  "rollNumber",
  "firstName",
  "lastName",
  "createdAt",
  "enrolledAt",
] as const;

function refId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
  return String(value);
}

export function toStudent(doc: StudentDocument, className?: string): StudentDTO {
  const result: StudentDTO = {
    id: String(doc._id),
    userId: String(doc.userId),
    rollNumber: doc.rollNumber,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    isActive: doc.isActive,
    enrolledAt: doc.enrolledAt.toISOString(),
  };
  if (doc.dateOfBirth) result.dateOfBirth = doc.dateOfBirth.toISOString();
  if (doc.guardianName) result.guardianName = doc.guardianName;
  if (doc.guardianPhone) result.guardianPhone = doc.guardianPhone;
  if (doc.phone) result.phone = doc.phone;
  if (doc.address) result.address = doc.address;
  const cid = refId(doc.classSectionId);
  if (cid) result.classSectionId = cid;
  if (className) result.classSectionName = className;
  const tid = refId(doc.termId);
  if (tid) result.termId = tid;
  return result;
}

async function classNamesFor(ids: unknown[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const classes = await ClassSection.find({ _id: { $in: ids } }).select("gradeLevel section");
  return new Map(classes.map((c) => [String(c._id), `${c.gradeLevel} ${c.section}`.trim()]));
}

async function assertClassExists(classSectionId?: string): Promise<void> {
  if (!classSectionId) return;
  const cls = await ClassSection.findById(classSectionId);
  if (!cls) throw ApiError.badRequest("The selected class does not exist");
  if (!cls.isActive) throw ApiError.badRequest("The selected class is no longer active");
}

export async function listStudents(query: ListQuery, actor: { role: string; id: string }) {
  const opts = buildListOptions(query, STUDENT_SORT_FIELDS, "lastName");
  const filter: Record<string, unknown> = {
    ...searchFilter(query.search, ["firstName", "lastName", "rollNumber", "email"]),
  };
  if (!query.includeInactive) filter.isActive = true;

  // A teacher sees only students in classes they teach or are class teacher of.
  // (Admins see everyone.) This is enforced here, not in the UI.
  if (actor.role === "teacher") {
    const classes = await ClassSection.find({ classTeacherId: actor.id }).select("_id");
    const { Subject } = await import("../models/Subject.js");
    const subjects = await Subject.find({ teacherId: actor.id }).select("classSectionId");
    const ids = [
      ...classes.map((c) => String(c._id)),
      ...subjects.map((s) => String(s.classSectionId ?? "")).filter(Boolean),
    ];
    filter.classSectionId = { $in: [...new Set(ids)] };
  }

  const { docs, pagination } = await paginateModel<StudentDocument>(Student, filter, opts);
  const names = await classNamesFor(docs.map((d) => d.classSectionId));
  const items = docs.map((d) => {
    const cid = refId(d.classSectionId);
    return toStudent(d, cid ? names.get(cid) : undefined);
  });

  return { items, pagination };
}

export async function getStudent(id: string): Promise<StudentDTO> {
  const doc = await Student.findById(id);
  if (!doc) throw ApiError.notFound("Student not found");
  const names = await classNamesFor([doc.classSectionId]);
  const cid = refId(doc.classSectionId);
  return toStudent(doc, cid ? names.get(cid) : undefined);
}

/** Resolves the student profile belonging to a logged-in student user. */
export async function getStudentForSelf(userId: string): Promise<StudentDTO> {
  const doc = await Student.findOne({ userId });
  if (!doc) throw ApiError.notFound("No student profile is linked to this account");
  const names = await classNamesFor([doc.classSectionId]);
  const cid = refId(doc.classSectionId);
  return toStudent(doc, cid ? names.get(cid) : undefined);
}

/**
 * Creates the login account AND the academic profile together.
 *
 * If profile creation fails after the user is created, the user is rolled back —
 * otherwise a failed create would leave an orphaned login with no profile.
 */
export async function createStudent(input: CreateInput, actor: AuditActor): Promise<StudentDTO> {
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) throw ApiError.conflict("An account with that email already exists");

  await assertClassExists(input.classSectionId);

  // A supplied password must meet the same bar as registration; if omitted we
  // issue a temporary one the admin can share, flagged for a reset.
  //
  // NOTE: pass the PLAINTEXT password. The User schema's pre-save hook owns
  // hashing — pre-hashing here would result in the value being hashed twice,
  // producing a stored hash that never matches.
  const password = input.password ?? `Temp-${Math.random().toString(36).slice(2, 10)}A1`;

  const user = await User.create({
    email: input.email,
    password,
    firstName: input.firstName,
    lastName: input.lastName,
    role: "student",
  });

  try {
    const rollNumber = await nextStudentRollNumber();
    const currentTerm = await Term.findOne({ isCurrent: true }).select("_id");

    const doc = await Student.create({
      userId: user._id,
      rollNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      guardianName: input.guardianName,
      guardianPhone: input.guardianPhone,
      phone: input.phone,
      address: input.address,
      classSectionId: input.classSectionId || undefined,
      termId: currentTerm?._id,
    });

    await audit.created(actor, {
      resource: "Student",
      resourceId: String(doc._id),
      resourceLabel: `${doc.rollNumber} — ${doc.firstName} ${doc.lastName}`,
    });

    return getStudent(String(doc._id));
  } catch (err) {
    // Roll back the orphaned login.
    await User.findByIdAndDelete(user._id).catch(() => {});
    throw err;
  }
}

/** Admin edit — full field access, including academic fields. */
export async function updateStudentAsAdmin(
  id: string,
  input: AdminUpdateInput,
  actor: AuditActor,
): Promise<StudentDTO> {
  const doc = await Student.findById(id);
  if (!doc) throw ApiError.notFound("Student not found");

  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.classSectionId !== undefined) await assertClassExists(input.classSectionId || undefined);

  if (input.classSectionId !== undefined) {
    doc.classSectionId = (input.classSectionId || undefined) as never;
  }
  if (input.firstName !== undefined) doc.firstName = input.firstName;
  if (input.lastName !== undefined) doc.lastName = input.lastName;
  if (input.dateOfBirth !== undefined) doc.dateOfBirth = new Date(input.dateOfBirth);
  if (input.guardianName !== undefined) doc.guardianName = input.guardianName;
  if (input.guardianPhone !== undefined) doc.guardianPhone = input.guardianPhone;
  if (input.phone !== undefined) doc.phone = input.phone;
  if (input.address !== undefined) doc.address = input.address;
  if (input.isActive !== undefined) doc.isActive = input.isActive;

  await doc.save();

  // Keep the login's display name in step with the profile.
  if (input.firstName !== undefined || input.lastName !== undefined) {
    await User.findByIdAndUpdate(doc.userId, {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    });
  }

  await audit.updated(
    actor,
    {
      resource: "Student",
      resourceId: String(doc._id),
      resourceLabel: `${doc.rollNumber} — ${doc.firstName} ${doc.lastName}`,
    },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return getStudent(String(doc._id));
}

/**
 * A student editing their OWN profile.
 * Only personal contact fields — the zod schema for this route has already
 * stripped anything academic, so this function cannot be used to self-promote
 * or change class assignment.
 */
export async function updateOwnStudentProfile(
  userId: string,
  input: SelfUpdateInput,
  actor: AuditActor,
): Promise<StudentDTO> {
  const doc = await Student.findOne({ userId });
  if (!doc) throw ApiError.notFound("No student profile is linked to this account");

  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.phone !== undefined) doc.phone = input.phone;
  if (input.address !== undefined) doc.address = input.address;
  if (input.guardianName !== undefined) doc.guardianName = input.guardianName;
  if (input.guardianPhone !== undefined) doc.guardianPhone = input.guardianPhone;

  await doc.save();

  await audit.updated(
    actor,
    {
      resource: "Student",
      resourceId: String(doc._id),
      resourceLabel: `${doc.rollNumber} — ${doc.firstName} ${doc.lastName}`,
    },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return getStudent(String(doc._id));
}

/** Soft delete — preserves academic history. */
export async function deactivateStudent(id: string, actor: AuditActor): Promise<void> {
  const doc = await Student.findById(id);
  if (!doc) throw ApiError.notFound("Student not found");

  if (!doc.isActive) throw ApiError.badRequest("This student is already deactivated");

  doc.isActive = false;
  await doc.save();
  await User.findByIdAndUpdate(doc.userId, { isActive: false });

  await audit.deleted(actor, {
    resource: "Student",
    resourceId: id,
    resourceLabel: `${doc.rollNumber} — ${doc.firstName} ${doc.lastName}`,
  });
}
