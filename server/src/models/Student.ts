import { Schema, model, type HydratedDocument } from "mongoose";

export interface IStudent {
  /** Links to the login account. */
  userId: Schema.Types.ObjectId;
  /** Auto-generated on create via the Counter model — never client-supplied. */
  rollNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: Date;
  guardianName?: string;
  guardianPhone?: string;
  /** Personal contact — the fields a student may edit on their own profile. */
  phone?: string;
  address?: string;
  classSectionId?: Schema.Types.ObjectId;
  termId?: Schema.Types.ObjectId;
  /** Soft-delete flag; students with academic history are deactivated, not removed. */
  isActive: boolean;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StudentDocument = HydratedDocument<IStudent>;

const studentSchema = new Schema<IStudent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one academic profile per login
    },
    rollNumber: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: [true, "First name is required"], trim: true, maxlength: 60 },
    lastName: { type: String, required: [true, "Last name is required"], trim: true, maxlength: 60 },
    email: { type: String, required: true, lowercase: true, trim: true },
    dateOfBirth: { type: Date, default: undefined },
    guardianName: { type: String, trim: true, maxlength: 120, default: undefined },
    guardianPhone: { type: String, trim: true, maxlength: 30, default: undefined },
    phone: { type: String, trim: true, maxlength: 30, default: undefined },
    address: { type: String, trim: true, maxlength: 300, default: undefined },
    classSectionId: { type: Schema.Types.ObjectId, ref: "ClassSection", default: undefined },
    termId: { type: Schema.Types.ObjectId, ref: "Term", default: undefined },
    isActive: { type: Boolean, default: true },
    enrolledAt: { type: Date, default: () => new Date() },
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

// Supports the list view's default sort and the class-roster query.
studentSchema.index({ isActive: 1, lastName: 1, firstName: 1 });
studentSchema.index({ classSectionId: 1, isActive: 1 });

studentSchema.virtual("fullName").get(function (this: IStudent) {
  return `${this.firstName} ${this.lastName}`.trim();
});

export const Student = model<IStudent>("Student", studentSchema);
