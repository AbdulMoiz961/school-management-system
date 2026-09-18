import { Schema, model, type HydratedDocument } from "mongoose";
import { TERM_STATUSES, type TermStatus } from "@sms/shared";

export interface ITerm {
  name: string;
  academicYear: string;
  startDate: Date;
  endDate: Date;
  status: TermStatus;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type TermDocument = HydratedDocument<ITerm>;

const termSchema = new Schema<ITerm>(
  {
    name: { type: String, required: [true, "Term name is required"], trim: true, maxlength: 80 },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
      match: [/^\d{4}(-\d{4})?$/, "Academic year must look like 2026 or 2026-2027"],
    },
    startDate: { type: Date, required: [true, "Start date is required"] },
    endDate: { type: Date, required: [true, "End date is required"] },
    status: {
      type: String,
      enum: { values: [...TERM_STATUSES], message: "Invalid term status: {VALUE}" },
      default: "upcoming",
    },
    isCurrent: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// A term must end after it starts.
termSchema.pre("validate", function (next) {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    this.invalidate("endDate", "End date must be after the start date");
  }
  next();
});

// Only one term can be current at a time. Clearing the flag on every other term
// keeps the invariant true without a transaction.
termSchema.pre("save", async function (next) {
  if (this.isModified("isCurrent") && this.isCurrent) {
    await model<ITerm>("Term").updateMany(
      { _id: { $ne: this._id }, isCurrent: true },
      { $set: { isCurrent: false } },
    );
  }
  next();
});

// Term names are unique within an academic year.
termSchema.index({ name: 1, academicYear: 1 }, { unique: true });
termSchema.index({ isCurrent: 1 });

export const Term = model<ITerm>("Term", termSchema);
