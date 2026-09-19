import { Schema, model, type HydratedDocument } from "mongoose";

export interface ISubmission {
  assignmentId: Schema.Types.ObjectId;
  studentId: Schema.Types.ObjectId;
  content?: string;
  fileUrl?: string;
  submittedAt: Date;
  /** Computed server-side against the assignment's due date — never trust the client. */
  isLate: boolean;
  marks?: number;
  feedback?: string;
  gradedBy?: Schema.Types.ObjectId;
  gradedAt?: Date;
}

export type SubmissionDocument = HydratedDocument<ISubmission>;

const submissionSchema = new Schema<ISubmission>(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    content: { type: String, trim: true, maxlength: 10000, default: undefined },
    fileUrl: { type: String, trim: true, maxlength: 500, default: undefined },
    submittedAt: { type: Date, default: () => new Date() },
    isLate: { type: Boolean, default: false },
    marks: { type: Number, min: [0, "Marks cannot be negative"], default: undefined },
    feedback: { type: String, trim: true, maxlength: 2000, default: undefined },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    gradedAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

/** One submission per student per assignment. */
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

export const Submission = model<ISubmission>("Submission", submissionSchema);
