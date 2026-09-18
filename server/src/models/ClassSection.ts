import { Schema, model, type HydratedDocument } from "mongoose";

export interface IClassSection {
  gradeLevel: string;
  section: string;
  capacity: number;
  classTeacherId?: Schema.Types.ObjectId;
  termId?: Schema.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClassSectionDocument = HydratedDocument<IClassSection>;

const classSectionSchema = new Schema<IClassSection>(
  {
    gradeLevel: {
      type: String,
      required: [true, "Grade level is required"],
      trim: true,
      maxlength: 40,
    },
    section: {
      type: String,
      required: [true, "Section is required"],
      trim: true,
      uppercase: true,
      maxlength: 10,
    },
    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      min: [1, "Capacity must be at least 1"],
      max: [200, "Capacity must be 200 or fewer"],
    },
    classTeacherId: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
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

// "Grade 10 A" is unique within a term. Two sections with the same grade+section
// would be indistinguishable to everyone using the system.
classSectionSchema.index({ gradeLevel: 1, section: 1, termId: 1 }, { unique: true });
classSectionSchema.index({ isActive: 1, gradeLevel: 1 });

export const ClassSection = model<IClassSection>("ClassSection", classSectionSchema);
