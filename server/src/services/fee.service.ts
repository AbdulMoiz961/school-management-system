import { FeeInvoice, type FeeInvoiceDocument } from "../models/FeeInvoice.js";
import { Student } from "../models/Student.js";
import { ApiError } from "../utils/ApiError.js";
import { buildListOptions, paginateModel, searchFilter } from "../utils/query.js";
import { audit, type AuditActor } from "./audit.service.js";
import type { FeeInvoice as FeeInvoiceDTO, FeeStatus, ListQuery } from "@sms/shared";

/** Total paid across a document's payments. */
function totalPaid(doc: { payments: { amount: number }[] }): number {
  return doc.payments.reduce((n, p) => n + p.amount, 0);
}

/** Derives the status from amount paid, the total, and the due date. */
export function deriveStatus(
  amount: number,
  paid: number,
  dueDate: Date,
): FeeStatus {
  if (paid >= amount) return "paid";
  if (paid > 0) return "partial";
  if (new Date() > dueDate) return "overdue";
  return "unpaid";
}

function toDTO(doc: FeeInvoiceDocument, studentName?: string): FeeInvoiceDTO {
  const paid = totalPaid(doc);
  return {
    id: String(doc._id),
    studentId: String(doc.studentId),
    ...(studentName ? { studentName } : {}),
    title: doc.title,
    amount: doc.amount,
    currency: doc.currency,
    dueDate: doc.dueDate.toISOString(),
    amountPaid: Math.round(paid * 100) / 100,
    status: deriveStatus(doc.amount, paid, doc.dueDate),
    payments: doc.payments.map((p) => ({
      id: String((p as { _id?: unknown })._id ?? ""),
      amount: p.amount,
      paidAt: p.paidAt.toISOString(),
      method: p.method,
      recordedBy: String(p.recordedBy),
      ...(p.reference ? { reference: p.reference } : {}),
    })),
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function listInvoices(query: ListQuery, filter: { studentId?: string } = {}) {
  const opts = buildListOptions(query, ["title", "dueDate", "createdAt"], "-createdAt");
  const filterDoc: Record<string, unknown> = {
    isActive: true,
    ...searchFilter(query.search, ["title"]),
  };
  if (query.includeInactive) delete filterDoc.isActive;
  if (filter.studentId) filterDoc.studentId = filter.studentId;

  const { docs, pagination } = await paginateModel<FeeInvoiceDocument>(FeeInvoice, filterDoc, opts);

  // Resolve student names in one query.
  const studentIds = [...new Set(docs.map((d) => String(d.studentId)))];
  const students = await Student.find({ _id: { $in: studentIds } })
    .select("firstName lastName rollNumber")
    .lean();
  const names = new Map(
    students.map((s) => [String(s._id), `${s.firstName} ${s.lastName}`.trim()]),
  );

  return {
    items: docs.map((d) => toDTO(d, names.get(String(d.studentId)))),
    pagination,
  };
}

export async function createInvoice(
  input: { studentId: string; title: string; amount: number; dueDate: string; currency?: string },
  actor: AuditActor & { id: string },
) {
  const student = await Student.findById(input.studentId);
  if (!student) throw ApiError.badRequest("The selected student does not exist");

  const doc = await FeeInvoice.create({
    studentId: input.studentId,
    title: input.title,
    amount: input.amount,
    currency: input.currency ?? "PKR",
    dueDate: new Date(input.dueDate),
  });

  await audit.created(actor, {
    resource: "FeeInvoice",
    resourceId: String(doc._id),
    resourceLabel: `${input.title} — ${input.amount} ${input.currency ?? "PKR"}`,
  });

  return toDTO(doc, `${student.firstName} ${student.lastName}`.trim());
}

/**
 * Record a payment against an invoice.
 *
 * Over-payment is rejected — the client can't push a balance negative by
 * mistake. The status is derived, never stored, so it can't go stale.
 */
export async function recordPayment(
  invoiceId: string,
  input: { amount: number; method?: string; reference?: string },
  actor: AuditActor & { id: string },
) {
  const doc = await FeeInvoice.findById(invoiceId);
  if (!doc) throw ApiError.notFound("Invoice not found");

  const paid = totalPaid(doc);
  if (paid + input.amount > doc.amount + 0.001) {
    const remaining = Math.round((doc.amount - paid) * 100) / 100;
    throw ApiError.badRequest(
      `Payment exceeds the outstanding balance of ${remaining} ${doc.currency}`,
    );
  }

  doc.payments.push({
    amount: input.amount,
    method: input.method ?? "cash",
    reference: input.reference,
    recordedBy: actor.id as never,
    paidAt: new Date(),
  });
  await doc.save();

  await audit.created(actor, {
    resource: "FeePayment",
    resourceId: String(doc._id),
    resourceLabel: `${doc.title} — ${input.amount} ${doc.currency}`,
  });

  return toDTO(doc);
}

export async function deleteInvoice(id: string, actor: AuditActor) {
  const doc = await FeeInvoice.findById(id);
  if (!doc) throw ApiError.notFound("Invoice not found");
  doc.isActive = false;
  await doc.save();
  await audit.deleted(actor, {
    resource: "FeeInvoice",
    resourceId: id,
    resourceLabel: doc.title,
  });
}

/** A student's own outstanding invoices. */
export async function myInvoices(studentId: string) {
  const docs = await FeeInvoice.find({ studentId, isActive: true }).sort({ dueDate: 1 }).lean();
  return docs.map((d) =>
    toDTO(
      d as unknown as FeeInvoiceDocument,
    ),
  );
}
