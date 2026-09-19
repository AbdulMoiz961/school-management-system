import { useState } from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import type { AcademicTerm, TermInput, TermStatus } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Input } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Field, Modal, Select, ConfirmDialog } from "@/components/form";
import { termsApi } from "@/api/resources";
import { useListState, usePaginatedQuery, useCrudMutations } from "@/lib/crud";
import { formatDate } from "@/lib/cn";
import { useAuth } from "@/features/auth/auth-context";

const STATUS_TONE: Record<TermStatus, "default" | "success" | "warning" | "primary"> = {
  upcoming: "warning",
  active: "success",
  completed: "default",
};

const emptyForm: TermInput = {
  name: "",
  academicYear: "",
  startDate: "",
  endDate: "",
  status: "upcoming",
  isCurrent: false,
};

export default function TermsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const list = useListState({ sortBy: "startDate", sortDir: "desc" });

  const query = usePaginatedQuery<AcademicTerm>(
    ["terms", list.query],
    () => termsApi.list(list.query),
  );

  const { createMutation, updateMutation, removeMutation } = useCrudMutations({
    entity: "Term",
    invalidateKeys: [["terms"], ["current-term"]],
    create: termsApi.create,
    update: termsApi.update,
    remove: termsApi.remove,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicTerm | null>(null);
  const [form, setForm] = useState<TermInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<AcademicTerm | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(t: AcademicTerm) {
    setEditing(t);
    setForm({
      name: t.name,
      academicYear: t.academicYear,
      startDate: t.startDate.slice(0, 10),
      endDate: t.endDate.slice(0, 10),
      status: t.status,
      isCurrent: t.isCurrent,
    });
    setErrors({});
    setModalOpen(true);
  }

  /** Client-side checks mirror the server schema for fast feedback. */
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Term name is required";
    if (!/^\d{4}(-\d{4})?$/.test(form.academicYear)) {
      e.academicYear = "Use a format like 2026 or 2026-2027";
    }
    if (!form.startDate) e.startDate = "Start date is required";
    if (!form.endDate) e.endDate = "End date is required";
    if (form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate)) {
      e.endDate = "End date must be after the start date";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit() {
    if (!validate()) return;
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, input: form as never });
    } else {
      await createMutation.mutateAsync(form as never);
    }
    setModalOpen(false);
  }

  const columns: Column<AcademicTerm>[] = [
    {
      key: "name",
      header: "Term",
      sortable: true,
      render: (t) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{t.name}</span>
          {t.isCurrent && (
            <Badge tone="primary">
              <Star className="mr-1 size-3 fill-current" /> Current
            </Badge>
          )}
        </div>
      ),
    },
    { key: "academicYear", header: "Year", sortable: true, render: (t) => t.academicYear },
    {
      key: "startDate",
      header: "Starts",
      sortable: true,
      hideBelow: "sm",
      render: (t) => formatDate(t.startDate),
    },
    {
      key: "endDate",
      header: "Ends",
      sortable: true,
      hideBelow: "sm",
      render: (t) => formatDate(t.endDate),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (t) => <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>,
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (t: AcademicTerm) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => openEdit(t)}
                  aria-label={`Edit ${t.name}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setConfirm(t)}
                  aria-label={`Delete ${t.name}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <AppLayout title="Academic Terms">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Academic terms</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Terms group classes and subjects into an academic period. Exactly one term can be
            marked as current.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={query.items}
          rowKey={(t) => t.id}
          isLoading={query.isLoading}
          isError={query.isError}
          errorMessage={query.error ? String(query.error) : undefined}
          page={query.pagination.page}
          totalPages={query.pagination.totalPages}
          total={query.pagination.total}
          onPageChange={list.setPage}
          sortBy={list.sortBy}
          sortDir={list.sortDir}
          onSortChange={list.onSortChange}
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder="Search terms…"
          emptyTitle="No terms yet"
          emptyDescription={
            isAdmin
              ? "Create your first academic term to start adding classes."
              : "No academic terms have been created yet."
          }
          emptyAction={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> New term
              </Button>
            ) : undefined
          }
          actions={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> New term
              </Button>
            ) : (
              <Badge tone="default">Read-only</Badge>
            )
          }
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit term" : "New academic term"}
        description={
          editing ? "Update this term's details." : "Define an academic period for classes and subjects."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editing ? "Save changes" : "Create term"}
            </Button>
          </>
        }
      >
        <Field label="Term name" required error={errors.name}>
          <Input
            value={form.name}
            error={!!errors.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Fall Semester"
          />
        </Field>

        <Field
          label="Academic year"
          required
          error={errors.academicYear}
          hint="Format: 2026 or 2026-2027"
        >
          <Input
            value={form.academicYear}
            error={!!errors.academicYear}
            onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
            placeholder="2026-2027"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required error={errors.startDate}>
            <Input
              type="date"
              value={form.startDate}
              error={!!errors.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field label="End date" required error={errors.endDate}>
            <Input
              type="date"
              value={form.endDate}
              error={!!errors.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Status">
          <Select
            value={form.status ?? "upcoming"}
            onChange={(v) => setForm({ ...form, status: v as TermStatus })}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3.5">
          <input
            type="checkbox"
            checked={form.isCurrent ?? false}
            onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Mark as the current term
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              New classes and students will default to this term. Any other current term will be
              cleared.
            </span>
          </span>
        </label>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm) await removeMutation.mutateAsync(confirm.id);
          setConfirm(null);
        }}
        busy={removeMutation.isPending}
        title="Delete term"
        confirmLabel="Delete term"
        message={
          <>
            Delete <strong className="text-foreground">{confirm?.name}</strong> (
            {confirm?.academicYear})? Terms that still have classes or subjects attached cannot be
            deleted.
          </>
        }
      />
    </AppLayout>
  );
}
