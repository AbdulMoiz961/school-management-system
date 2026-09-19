import { Schema, model, type HydratedDocument } from "mongoose";

export interface IAssignment {
  subjectId: Schema.Types.ObjectId;
  title: string;
  description: string;
  dueDate: Date;
  maxMarks: number;
  isActive: boolean;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AssignmentDocument = HydratedDocument<IAssignment>;

const assignmentSchema = new Schema<IAssignment>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    dueDate: { type: Date, required: [true, "Due date is required"] },
    maxMarks: {
      type: Number,
      required: true,
      min: [1, "Max marks must be at least 1"],
      max: [1000, "Max marks cannot exceed 1000"],
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

assignmentSchema.index({ subjectId: 1, dueDate: -1 });

export const Assignment = model<IAssignment>("Assignment", assignmentSchema);
