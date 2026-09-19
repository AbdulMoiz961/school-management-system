import { Schema, model, type HydratedDocument } from "mongoose";

export interface IFeePayment {
  amount: number;
  paidAt: Date;
  method: string;
  recordedBy: Schema.Types.ObjectId;
  reference?: string;
}

export interface IFeeInvoice {
  studentId: Schema.Types.ObjectId;
  title: string;
  amount: number;
  currency: string;
  dueDate: Date;
  payments: IFeePayment[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type FeeInvoiceDocument = HydratedDocument<IFeeInvoice>;

const paymentSchema = new Schema<IFeePayment>(
  {
    amount: { type: Number, required: true, min: [0.01, "Payment must be positive"] },
    paidAt: { type: Date, default: () => new Date() },
    method: { type: String, trim: true, maxlength: 40, default: "cash" },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reference: { type: String, trim: true, maxlength: 120, default: undefined },
  },
  { _id: true },
);

const feeInvoiceSchema = new Schema<IFeeInvoice>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 160 },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be positive"],
      max: [1_000_000, "Amount is unreasonably large"],
    },
    currency: { type: String, trim: true, maxlength: 8, default: "PKR" },
    dueDate: { type: Date, required: [true, "Due date is required"] },
    payments: { type: [paymentSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

feeInvoiceSchema.index({ studentId: 1, isActive: 1 });

export const FeeInvoice = model<IFeeInvoice>("FeeInvoice", feeInvoiceSchema);
