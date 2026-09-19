import type { DashboardStats, FeeInvoice, ListQuery, Paginated } from "@sms/shared";
import { api } from "./client";

function qs(query: object = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface FeePaymentInput {
  amount: number;
  method?: string;
  reference?: string;
}

export const feesApi = {
  list: (query: ListQuery = {}) => api.get<Paginated<FeeInvoice>>(`/fees${qs(query)}`),
  mine: () => api.get<FeeInvoice[]>("/fees/me"),
  create: (input: {
    studentId: string;
    title: string;
    amount: number;
    dueDate: string;
    currency?: string;
  }) => api.post<FeeInvoice>("/fees", input),
  pay: (invoiceId: string, input: FeePaymentInput) =>
    api.post<FeeInvoice>(`/fees/${invoiceId}/payments`, input),
  remove: (id: string) => api.delete<{ message: string }>(`/fees/${id}`),
};

export const dashboardApi = {
  get: () => api.get<DashboardStats>("/dashboard"),
};
