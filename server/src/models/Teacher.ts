import { Schema, model, type HydratedDocument } from "mongoose";

export interface ITeacher {
  userId: Schema.Types.ObjectId;
  /** Auto-generated on create — never client-supplied. */
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Subject codes this teacher is qualified to teach, e.g. ["MATH-10"]. */
  subjectCodes: string[];
  isActive: boolean;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type TeacherDocument = HydratedDocument<ITeacher>;

const teacherSchema = new Schema<ITeacher>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    employeeId: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: [true, "First name is required"], trim: true, maxlength: 60 },
    lastName: { type: String, required: [true, "Last name is required"], trim: true, maxlength: 60 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: 30, default: undefined },
    subjectCodes: {
      type: [String],
      default: [],
      // Normalise to uppercase so "math-10" and "MATH-10" don't diverge.
      set: (codes: string[]) => codes.map((c) => c.trim().toUpperCase()).filter(Boolean),
    },
    isActive: { type: Boolean, default: true },
    joinedAt: { type: Date, default: () => new Date() },
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

teacherSchema.index({ isActive: 1, lastName: 1, firstName: 1 });

teacherSchema.virtual("fullName").get(function (this: ITeacher) {
  return `${this.firstName} ${this.lastName}`.trim();
});

export const Teacher = model<ITeacher>("Teacher", teacherSchema);
