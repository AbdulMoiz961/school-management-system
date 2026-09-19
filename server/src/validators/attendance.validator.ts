import { z } from "zod";
import { ATTENDANCE_STATUSES, WEEKDAYS, ROLES } from "@sms/shared";
import { listQuerySchema } from "./academic.validator.js";

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

const optionalObjectId = objectId.optional().or(z.literal(""));

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Must be a valid date" });

/** "HH:mm" 24-hour. */
const timeString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:mm format (e.g. 09:30)");

/* ---------------------------------------------------------------- attendance */

export const markRegisterSchema = z.object({
  subjectId: objectId,
  date: isoDate,
  entries: z
    .array(
      z.object({
        studentId: objectId,
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "At least one student entry is required")
    // Duplicate students in one submission would violate the unique index and
    // produce a confusing error, so reject early with a clear message.
    .refine(
      (entries) => new Set(entries.map((e) => e.studentId)).size === entries.length,
      { message: "Each student may appear only once in a register" },
    ),
});

export const attendanceSummaryQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  subjectId: optionalObjectId,
});

export const attendanceRangeQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  subjectId: optionalObjectId,
});

export const studentHistoryQuerySchema = listQuerySchema.extend({
  studentId: optionalObjectId,
  subjectId: optionalObjectId,
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/* ---------------------------------------------------------------- timetable */

export const createSlotSchema = z
  .object({
    classSectionId: objectId,
    subjectId: objectId,
    teacherId: objectId,
    day: z.enum(WEEKDAYS),
    startTime: timeString,
    endTime: timeString,
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export const updateSlotSchema = z
  .object({
    classSectionId: optionalObjectId,
    subjectId: optionalObjectId,
    teacherId: optionalObjectId,
    day: z.enum(WEEKDAYS).optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
  })
  .refine((d) => !d.startTime || !d.endTime || d.startTime < d.endTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export const conflictCheckSchema = z
  .object({
    classSectionId: objectId,
    teacherId: objectId,
    day: z.enum(WEEKDAYS),
    startTime: timeString,
    endTime: timeString,
    excludeSlotId: optionalObjectId,
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export const timetableQuerySchema = z.object({
  classSectionId: optionalObjectId,
  day: z.enum(WEEKDAYS).optional(),
});

/* ------------------------------------------------------------ announcements */

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  body: z.string().trim().min(1, "Body is required").max(5000),
  audienceRoles: z.array(z.enum(ROLES)).default([]),
  classSectionId: optionalObjectId,
  requiresAcknowledgement: z.boolean().optional(),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const announcementQuerySchema = listQuerySchema.extend({
  classSectionId: optionalObjectId,
});

export type MarkRegisterInput = z.infer<typeof markRegisterSchema>;
export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
