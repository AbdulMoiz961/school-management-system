import { Schema, model, type HydratedDocument } from "mongoose";
import { WEEKDAYS, type Weekday } from "@sms/shared";

export interface ITimetableSlot {
  classSectionId: Schema.Types.ObjectId;
  subjectId: Schema.Types.ObjectId;
  teacherId: Schema.Types.ObjectId;
  day: Weekday;
  /** Minutes since midnight — stored as a number so comparisons are trivial. */
  startMinutes: number;
  endMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TimetableSlotDocument = HydratedDocument<ITimetableSlot>;

/** "09:30" → 570. Keeps overlap maths as plain integer comparison. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 570 → "09:30" */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const timetableSchema = new Schema<ITimetableSlot>(
  {
    classSectionId: { type: Schema.Types.ObjectId, ref: "ClassSection", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    day: {
      type: String,
      enum: { values: [...WEEKDAYS], message: "Invalid day: {VALUE}" },
      required: true,
    },
    startMinutes: {
      type: Number,
      required: true,
      min: [0, "Start time cannot be before 00:00"],
      max: [1439, "Start time cannot be after 23:59"],
    },
    endMinutes: {
      type: Number,
      required: true,
      min: [1, "End time must be after 00:00"],
      max: [1440, "End time cannot exceed midnight"],
    },
  },
  { timestamps: true },
);

timetableSchema.pre("validate", function (next) {
  if (this.startMinutes >= this.endMinutes) {
    this.invalidate("endMinutes", "End time must be after the start time");
  }
  next();
});

// A class cannot have two slots starting at the same minute on the same day.
// Overlapping (but not identical) slots are caught by the conflict service,
// which needs to report details rather than just reject.
timetableSchema.index({ classSectionId: 1, day: 1, startMinutes: 1 }, { unique: true });
timetableSchema.index({ teacherId: 1, day: 1 });

export const TimetableSlot = model<ITimetableSlot>("TimetableSlot", timetableSchema);
