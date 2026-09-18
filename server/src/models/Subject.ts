import { Schema, model, type HydratedDocument } from "mongoose";

export interface ISubject {
  name: string;
  code: string;
  creditHours: number;
  classSectionId?: Schema.Types.ObjectId;
  teacherId?: Schema.Types.ObjectId;
  termId?: Schema.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SubjectDocument = HydratedDocument<ISubject>;

const subjectSchema = new Schema<ISubject>(
  {
    name: { type: String, required: [true, "Subject name is required"], trim: true, maxlength: 80 },
    code: {
      type: String,
      required: [true, "Subject code is required"],
      trim: true,
      uppercase: true,
      maxlength: 20,
      match: [/^[A-Z0-9-]+$/, "Code may only contain letters, numbers and dashes"],
    },
    creditHours: {
      type: Number,
      required: [true, "Credit hours are required"],
      min: [0, "Credit hours cannot be negative"],
      max: [20, "Credit hours must be 20 or fewer"],
    },
    classSectionId: { type: Schema.Types.ObjectId, ref: "ClassSection", default: undefined },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    termId: { type: Schema.Types.ObjectId, ref: "Term", default: undefined },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        ret.isActive = ret.isActive ?? true;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Subject codes must be unique per term — "MATH-10" in two terms is legitimate,
// two "MATH-10" in the same term is a data-entry mistake.
subjectSchema.index({ code: 1, termId: 1 }, { unique: true });
subjectSchema.index({ classSectionId: 1, isActive: 1 });
subjectSchema.index({ teacherId: 1 });

export const Subject = model<ISubject>("Subject", subjectSchema);
