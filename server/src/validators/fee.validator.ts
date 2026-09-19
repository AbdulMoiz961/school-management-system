import { z } from "zod";
import { FEE_STATUSES } from "@sms/shared";

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Must be a valid date" });

export const createInvoiceSchema = z.object({
  studentId: objectId,
  title: z.string().trim().min(1, "Title is required").max(160),
  amount: z.number().positive("Amount must be positive").max(1_000_000),
  dueDate: isoDate,
  currency: z.string().trim().max(8).optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive("Payment must be positive"),
  method: z.string().trim().max(40).optional(),
  reference: z.string().trim().max(120).optional(),
});

export const invoiceQuerySchema = z.object({
  studentId: objectId.optional(),
  status: z.enum(FEE_STATUSES).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
