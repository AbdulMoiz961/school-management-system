import { Schema, model, type HydratedDocument } from "mongoose";

export interface IExamMark {
  examId: Schema.Types.ObjectId;
  studentId: Schema.Types.ObjectId;
  marks: number;
  enteredBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ExamMarkDocument = HydratedDocument<IExamMark>;

const examMarkSchema = new Schema<IExamMark>(
  {
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    marks: { type: Number, required: true, min: [0, "Marks cannot be negative"] },
    enteredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

/** One mark per student per exam — re-entry updates rather than duplicates. */
examMarkSchema.index({ examId: 1, studentId: 1 }, { unique: true });

export const ExamMark = model<IExamMark>("ExamMark", examMarkSchema);
