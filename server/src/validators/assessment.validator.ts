import { z } from "zod";
import { listQuerySchema } from "./academic.validator.js";

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Must be a valid date" });

const marks = z
  .number()
  .min(0, "Marks cannot be negative")
  .max(1000, "Marks cannot exceed 1000");

/* ---------------------------------------------------------------- assignments */

export const createAssignmentSchema = z.object({
  subjectId: objectId,
  title: z.string().trim().min(1, "Title is required").max(160),
  description: z.string().trim().max(5000).optional(),
  dueDate: isoDate,
  maxMarks: z.number().int().min(1).max(1000),
});

export const submitAssignmentSchema = z
  .object({
    content: z.string().trim().max(10000).optional(),
    fileUrl: z.string().trim().max(500).optional(),
  })
  .refine((d) => !!d.content?.trim() || !!d.fileUrl?.trim(), {
    message: "Provide either written content or a link to your work",
    path: ["content"],
  });

export const gradeSubmissionSchema = z.object({
  marks,
  feedback: z.string().trim().max(2000).optional(),
});

/* ---------------------------------------------------------------------- exams */

export const createExamSchema = z.object({
  subjectId: objectId,
  name: z.string().trim().min(1, "Exam name is required").max(160),
  examDate: isoDate,
  maxMarks: z.number().int().min(1).max(1000),
});

export const saveExamMarksSchema = z.object({
  entries: z
    .array(z.object({ studentId: objectId, marks }))
    .min(1, "At least one mark is required")
    .refine((e) => new Set(e.map((x) => x.studentId)).size === e.length, {
      message: "Each student may appear only once",
    }),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type SaveExamMarksInput = z.infer<typeof saveExamMarksSchema>;
export { listQuerySchema };
