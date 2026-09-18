import { z } from "zod";
import { TERM_STATUSES } from "@sms/shared";

/** Reusable query schema for every list endpoint. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  // Query strings arrive as "true"/"false", so coerce rather than expect a boolean.
  includeInactive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Must be a valid date" });

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id")
  .optional()
  .or(z.literal(""));

export const createTermSchema = z
  .object({
    name: z.string().trim().min(1, "Term name is required").max(80),
    academicYear: z
      .string()
      .trim()
      .regex(/^\d{4}(-\d{4})?$/, "Academic year must look like 2026 or 2026-2027"),
    startDate: isoDate,
    endDate: isoDate,
    status: z.enum(TERM_STATUSES).optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine((d) => new Date(d.endDate) > new Date(d.startDate), {
    message: "End date must be after the start date",
    path: ["endDate"],
  });

export const updateTermSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    academicYear: z
      .string()
      .trim()
      .regex(/^\d{4}(-\d{4})?$/)
      .optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    status: z.enum(TERM_STATUSES).optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine(
    (d) => {
      if (d.startDate && d.endDate) return new Date(d.endDate) > new Date(d.startDate);
      return true;
    },
    { message: "End date must be after the start date", path: ["endDate"] },
  );

export const createClassSchema = z.object({
  gradeLevel: z.string().trim().min(1, "Grade level is required").max(40),
  section: z.string().trim().min(1, "Section is required").max(10),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "Capacity must be at least 1")
    .max(200, "Capacity must be 200 or fewer"),
  classTeacherId: objectId,
  termId: objectId,
});

export const updateClassSchema = createClassSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required").max(80),
  code: z
    .string()
    .trim()
    .min(1, "Subject code is required")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Code may only contain letters, numbers and dashes"),
  creditHours: z.coerce.number().min(0).max(20),
  classSectionId: objectId,
  teacherId: objectId,
  termId: objectId,
});

export const updateSubjectSchema = createSubjectSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128).optional(),
  dateOfBirth: isoDate.optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  classSectionId: objectId,
});

/** A student editing their own profile — academic fields are not accepted here. */
export const studentSelfUpdateSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
});

/** An admin editing any student. */
export const studentAdminUpdateSchema = studentSelfUpdateSchema.extend({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  dateOfBirth: isoDate.optional(),
  classSectionId: objectId,
  isActive: z.boolean().optional(),
});

export const createTeacherSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8).max(128).optional(),
  phone: z.string().trim().max(30).optional(),
  subjectCodes: z.array(z.string().trim().max(20)).optional(),
});

export const updateTeacherSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).optional(),
  subjectCodes: z.array(z.string().trim().max(20)).optional(),
  isActive: z.boolean().optional(),
});

export const auditListQuerySchema = listQuerySchema.extend({
  resource: z.string().trim().max(60).optional(),
  action: z.enum(["create", "update", "delete"]).optional(),
});
