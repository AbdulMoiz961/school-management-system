import { Teacher, type TeacherDocument } from "../models/Teacher.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { nextEmployeeId } from "../models/Counter.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { Teacher as TeacherDTO, ListQuery } from "@sms/shared";
import type { z } from "zod";
import type { createTeacherSchema, updateTeacherSchema } from "../validators/academic.validator.js";

type CreateInput = z.infer<typeof createTeacherSchema>;
type UpdateInput = z.infer<typeof updateTeacherSchema>;

export const TEACHER_SORT_FIELDS = [
  "employeeId",
  "firstName",
  "lastName",
  "createdAt",
  "joinedAt",
] as const;

export function toTeacher(doc: TeacherDocument): TeacherDTO {
  const result: TeacherDTO = {
    id: String(doc._id),
    userId: String(doc.userId),
    employeeId: doc.employeeId,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    subjectCodes: doc.subjectCodes ?? [],
    isActive: doc.isActive,
    joinedAt: doc.joinedAt.toISOString(),
  };
  if (doc.phone) result.phone = doc.phone;
  return result;
}

export async function listTeachers(query: ListQuery) {
  const opts = buildListOptions(query, TEACHER_SORT_FIELDS, "lastName");
  const filter: Record<string, unknown> = {
    ...searchFilter(query.search, ["firstName", "lastName", "employeeId", "email"]),
  };
  if (!query.includeInactive) filter.isActive = true;

  const { docs, pagination } = await paginateModel<TeacherDocument>(Teacher, filter, opts);
  return { items: docs.map(toTeacher), pagination };
}

export async function getTeacher(id: string): Promise<TeacherDTO> {
  const doc = await Teacher.findById(id);
  if (!doc) throw ApiError.notFound("Teacher not found");
  return toTeacher(doc);
}

/** Resolves the teacher profile linked to a logged-in teacher user. */
export async function getTeacherForSelf(userId: string): Promise<TeacherDTO> {
  const doc = await Teacher.findOne({ userId });
  if (!doc) throw ApiError.notFound("No teacher profile is linked to this account");
  return toTeacher(doc);
}

/**
 * Creates the login AND the staff profile together, rolling back the user if
 * profile creation fails so we never leave an orphaned account.
 */
export async function createTeacher(input: CreateInput, actor: AuditActor): Promise<TeacherDTO> {
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) throw ApiError.conflict("An account with that email already exists");

  // Pass the PLAINTEXT password — the User schema's pre-save hook hashes it.
  // Pre-hashing here would double-hash and produce an unusable credential.
  const password = input.password ?? `Temp-${Math.random().toString(36).slice(2, 10)}A1`;

  const user = await User.create({
    email: input.email,
    password,
    firstName: input.firstName,
    lastName: input.lastName,
    role: "teacher",
  });

  try {
    const employeeId = await nextEmployeeId();
    const doc = await Teacher.create({
      userId: user._id,
      employeeId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      subjectCodes: input.subjectCodes ?? [],
    });

    await audit.created(actor, {
      resource: "Teacher",
      resourceId: String(doc._id),
      resourceLabel: `${doc.employeeId} — ${doc.firstName} ${doc.lastName}`,
    });

    return toTeacher(doc);
  } catch (err) {
    await User.findByIdAndDelete(user._id).catch(() => {});
    throw err;
  }
}

export async function updateTeacher(
  id: string,
  input: UpdateInput,
  actor: AuditActor,
): Promise<TeacherDTO> {
  const doc = await Teacher.findById(id);
  if (!doc) throw ApiError.notFound("Teacher not found");

  const before = doc.toObject() as unknown as Record<string, unknown>;

  if (input.firstName !== undefined) doc.firstName = input.firstName;
  if (input.lastName !== undefined) doc.lastName = input.lastName;
  if (input.phone !== undefined) doc.phone = input.phone;
  if (input.subjectCodes !== undefined) doc.subjectCodes = input.subjectCodes;
  if (input.isActive !== undefined) doc.isActive = input.isActive;

  await doc.save();

  if (input.firstName !== undefined || input.lastName !== undefined) {
    await User.findByIdAndUpdate(doc.userId, {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    });
  }

  await audit.updated(
    actor,
    {
      resource: "Teacher",
      resourceId: String(doc._id),
      resourceLabel: `${doc.employeeId} — ${doc.firstName} ${doc.lastName}`,
    },
    before,
    doc.toObject() as unknown as Record<string, unknown>,
  );

  return toTeacher(doc);
}

/** Soft delete — a teacher may still be referenced by past timetable/grades. */
export async function deactivateTeacher(id: string, actor: AuditActor): Promise<void> {
  const doc = await Teacher.findById(id);
  if (!doc) throw ApiError.notFound("Teacher not found");

  if (!doc.isActive) throw ApiError.badRequest("This teacher is already deactivated");

  doc.isActive = false;
  await doc.save();
  await User.findByIdAndUpdate(doc.userId, { isActive: false });

  await audit.deleted(actor, {
    resource: "Teacher",
    resourceId: id,
    resourceLabel: `${doc.employeeId} — ${doc.firstName} ${doc.lastName}`,
  });
}
