import { Schema, model, type HydratedDocument } from "mongoose";

export interface IExam {
  subjectId: Schema.Types.ObjectId;
  name: string;
  examDate: Date;
  maxMarks: number;
  isActive: boolean;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ExamDocument = HydratedDocument<IExam>;

const examSchema = new Schema<IExam>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    name: { type: String, required: [true, "Exam name is required"], trim: true, maxlength: 160 },
    examDate: { type: Date, required: [true, "Exam date is required"] },
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

export const Exam = model<IExam>("Exam", examSchema);
