import { Schema, model, type HydratedDocument } from "mongoose";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@sms/shared";

export interface IAttendance {
  studentId: Schema.Types.ObjectId;
  subjectId: Schema.Types.ObjectId;
  classSectionId?: Schema.Types.ObjectId;
  /**
   * Normalised to UTC midnight. Storing the raw timestamp would let the same
   * calendar day produce two different documents.
   */
  date: Date;
  status: AttendanceStatus;
  note?: string;
  markedBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceDocument = HydratedDocument<IAttendance>;

/** Strips the time component so one row exists per calendar day. */
export function toDayStart(input: Date | string): Date {
  const d = new Date(input);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const attendanceSchema = new Schema<IAttendance>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    classSectionId: { type: Schema.Types.ObjectId, ref: "ClassSection", default: undefined },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: { values: [...ATTENDANCE_STATUSES], message: "Invalid status: {VALUE}" },
      required: true,
    },
    note: { type: String, trim: true, maxlength: 200, default: undefined },
    markedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

/**
 * The core invariant: a student can have at most ONE attendance record per
 * subject per day. This makes double-marking impossible at the database level
 * rather than relying on application checks, which can race.
 */
attendanceSchema.index({ studentId: 1, subjectId: 1, date: 1 }, { unique: true });

// Supports the "whole class for a subject on a date" register query.
attendanceSchema.index({ subjectId: 1, date: 1 });
// Supports per-student history and the percentage aggregation.
attendanceSchema.index({ studentId: 1, date: -1 });

export const Attendance = model<IAttendance>("Attendance", attendanceSchema);
