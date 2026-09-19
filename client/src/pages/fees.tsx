import { useState } from "react";
import { Banknote, Plus, Receipt, Trash2 } from "lucide-react";
import type { FeeInvoice, Student } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { ConfirmDialog, Field, Modal, Select } from "@/components/form";
import { feesApi } from "@/api/phase6";
import { studentsApi } from "@/api/resources";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useListState, usePaginatedQuery } from "@/lib/crud";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const STATUS_TONE: Record<FeeInvoice["status"], "default" | "success" | "warning" | "danger"> = {
  unpaid: "default",
  partial: "warning",
  paid: "success",
  overdue: "danger",
};

export default function FeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return isAdmin ? <AdminFees /> : <MyFees />;
}

/* -------------------------------------------------------------- admin view */

function AdminFees() {
  const qc = useQueryClient();
  const listState = useListState({ sortBy: "dueDate", sortDir: "asc" });
  const list = usePaginatedQuery<FeeInvoice>(["fees", listState.query], () =>
    feesApi.list(listState.query),
  );

  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<FeeInvoice | null>(null);
  const [confirm, setConfirm] = useState<FeeInvoice | null>(null);
  const [form, setForm] = useState({
    studentId: "",
    title: "",
    amount: 0,
    dueDate: "",
    currency: "PKR",
  });
  const [pay, setPay] = useState({ amount: 0, method: "cash", reference: "" });

  const students = useQuery({
    queryKey: ["students-all"],
    queryFn: () => studentsApi.list({ limit: 100 }),
  });

  const create = useMutation({
    mutationFn: () => feesApi.create({ ...form, dueDate: new Date(form.dueDate).toISOString() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fees"] });
      toast.success("Invoice created");
      setOpen(false);
      setForm({ studentId: "", title: "", amount: 0, dueDate: "", currency: "PKR" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const recordPayment = useMutation({
    mutationFn: () => feesApi.pay(paying!.id, pay),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["fees"] });
      toast.success(`Payment recorded — balance ${res.amount - res.amountPaid} ${res.currency}`);
      setPaying(null);
      setPay({ amount: 0, method: "cash", reference: "" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => feesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fees"] });
      toast.success("Invoice removed");
      setConfirm(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const options = (students.data?.items ?? []).map((s: Student) => ({
    value: s.id,
    label: `${s.rollNumber} — ${s.firstName} ${s.lastName}`,
  }));

  return (
    <AppLayout title="Fees">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Fees</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Issue invoices and record partial payments. Status is derived from the balance.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New invoice
          </Button>
        </div>

        {list.isLoading && <Loading />}

        {list.items.length === 0 && !list.isLoading && (
          <Card>
            <div className="py-14 text-center">
              <Receipt className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {list.items.map((inv) => {
            const remaining = inv.amount - inv.amountPaid;
            return (
              <Card key={inv.id} className="group">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-medium text-foreground">
                        {inv.title}
                      </h3>
                      <Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                    </div>
                    {inv.studentName && (
                      <p className="mt-1 text-xs text-muted-foreground">{inv.studentName}</p>
                    )}
                    <p className="mt-2 text-sm text-foreground">
                      {inv.amountPaid}/{inv.amount} {inv.currency}
                      {remaining > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · {remaining} outstanding
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Due{" "}
                      {new Date(inv.dueDate).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {remaining > 0 && (
                      <Button size="sm" variant="outline" onClick={() => setPaying(inv)}>
                        <Banknote className="size-3.5" /> Record payment
                      </Button>
                    )}
                    <button
                      onClick={() => setConfirm(inv)}
                      aria-label="Delete invoice"
                      className="rounded p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New invoice"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              isLoading={create.isPending}
              disabled={!form.studentId || !form.title.trim() || !form.dueDate || form.amount <= 0}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Student">
          <Select
            value={form.studentId}
            onChange={(v: string) => setForm({ ...form, studentId: v })}
            options={options}
            placeholder="Select a student"
          />
        </Field>
        <Field label="Title">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Spring term fee"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount">
            <Input
              type="number"
              min={0.01}
              value={form.amount || ""}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Currency">
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title={`Record payment — ${paying?.title ?? ""}`}
        description={
          paying ? `Outstanding: ${paying.amount - paying.amountPaid} ${paying.currency}` : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => recordPayment.mutate()}
              isLoading={recordPayment.isPending}
              disabled={pay.amount <= 0}
            >
              Record
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <Input
              type="number"
              min={0.01}
              value={pay.amount || ""}
              onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Method">
            <Select
              value={pay.method}
              onChange={(v: string) => setPay({ ...pay, method: v })}
              options={[
                { value: "cash", label: "Cash" },
                { value: "bank transfer", label: "Bank transfer" },
                { value: "card", label: "Card" },
              ]}
            />
          </Field>
        </div>
        <Field label="Reference" hint="Optional — transaction number.">
          <Input
            value={pay.reference}
            onChange={(e) => setPay({ ...pay, reference: e.target.value })}
            placeholder="TXN-…"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.id)}
        busy={remove.isPending}
        title="Remove invoice"
        confirmLabel="Remove"
        message={
          <>
            Remove <strong className="text-foreground">{confirm?.title}</strong>? Any recorded
            payments go with it.
          </>
        }
      />
    </AppLayout>
  );
}

/* ------------------------------------------------------------ student view */

function MyFees() {
  const fees = useQuery({ queryKey: ["my-fees"], queryFn: () => feesApi.mine() });

  return (
    <AppLayout title="Fees">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">My fees</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your outstanding and settled invoices.</p>
        </div>

        {fees.isLoading && <Loading />}

        {fees.data && fees.data.length === 0 && (
          <Card>
            <div className="py-14 text-center">
              <Receipt className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">You have no invoices.</p>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {fees.data?.map((inv) => (
            <Card key={inv.id}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-medium text-foreground">
                      {inv.title}
                    </h3>
                    <Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {inv.amountPaid}/{inv.amount} {inv.currency}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Due{" "}
                  {new Date(inv.dueDate).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
      <Spinner /> Loading…
    </div>
  );
}
