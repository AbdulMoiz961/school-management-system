import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import type { Teacher, TeacherCreateInput } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Button, Input } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Field, Modal, ConfirmDialog } from "@/components/form";
import { teachersApi } from "@/api/resources";
import { useListState, usePaginatedQuery, useCrudMutations } from "@/lib/crud";
import { formatDate } from "@/lib/cn";

const emptyForm: TeacherCreateInput = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phone: "",
  subjectCodes: [],
};

/** Small tag editor for subject codes. */
function CodeEditor({
  codes,
  onChange,
}: {
  codes: string[];
  onChange: (codes: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim().toUpperCase();
    if (!v) return;
    if (!codes.includes(v)) onChange([...codes, v]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. MATH-10"
          className="font-mono"
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      {codes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary"
            >
              {c}
              <button
                type="button"
                onClick={() => onChange(codes.filter((x) => x !== c))}
                aria-label={`Remove ${c}`}
                className="text-primary/70 hover:text-primary"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeachersPage() {
  const list = useListState({ sortBy: "lastName", sortDir: "asc" });

  const query = usePaginatedQuery<Teacher>(["teachers", list.query], () =>
    teachersApi.list(list.query),
  );

  const { createMutation, updateMutation, removeMutation } = useCrudMutations({
    entity: "Teacher",
    invalidateKeys: [["teachers"], ["teachers-all"]],
    create: teachersApi.create,
    update: teachersApi.update,
    remove: teachersApi.remove,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<TeacherCreateInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Teacher | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(t: Teacher) {
    setEditing(t);
    setForm({
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      password: "",
      phone: t.phone ?? "",
      subjectCodes: t.subjectCodes ?? [],
    });
    setErrors({});
    setModalOpen(true);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    if (!editing) {
      if (!form.email.trim()) e.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
      if (form.password && form.password.length < 8)
        e.password = "Password must be at least 8 characters";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit() {
    if (!validate()) return;
    if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        input: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone || undefined,
          subjectCodes: form.subjectCodes,
        } as never,
      });
    } else {
      await createMutation.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        ...(form.password ? { password: form.password } : {}),
        phone: form.phone || undefined,
        subjectCodes: form.subjectCodes,
      } as never);
    }
    setModalOpen(false);
  }

  const columns: Column<Teacher>[] = [
    {
      key: "employeeId",
      header: "Employee ID",
      sortable: true,
      render: (t) => <span className="font-mono text-xs">{t.employeeId}</span>,
    },
    {
      key: "lastName",
      header: "Name",
      sortable: true,
      render: (t) => (
        <span className="font-medium text-foreground">
          {t.firstName} {t.lastName}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      hideBelow: "sm",
      render: (t) => <span className="text-muted-foreground">{t.email}</span>,
    },
    {
      key: "subjectCodes",
      header: "Subjects",
      hideBelow: "md",
      render: (t) =>
        t.subjectCodes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {t.subjectCodes.slice(0, 3).map((c) => (
              <span key={c} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                {c}
              </span>
            ))}
            {t.subjectCodes.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{t.subjectCodes.length - 3}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "joinedAt",
      header: "Joined",
      sortable: true,
      hideBelow: "lg",
      render: (t) => <span className="text-xs text-muted-foreground">{formatDate(t.joinedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (t) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(t)}
            aria-label={`Edit ${t.firstName} ${t.lastName}`}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={() => setConfirm(t)}
            aria-label={`Deactivate ${t.firstName} ${t.lastName}`}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout title="Teachers">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Teachers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creating a teacher also creates their login. Employee IDs are generated automatically.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={query.items}
          rowKey={(t) => t.id}
          isLoading={query.isLoading}
          isError={query.isError}
          page={query.pagination.page}
          totalPages={query.pagination.totalPages}
          total={query.pagination.total}
          onPageChange={list.setPage}
          sortBy={list.sortBy}
          sortDir={list.sortDir}
          onSortChange={list.onSortChange}
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder="Search by name, ID or email…"
          emptyTitle="No teachers yet"
          emptyDescription="Add a teacher to start assigning subjects and classes."
          emptyAction={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New teacher
            </Button>
          }
          actions={
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New teacher
            </Button>
          }
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit teacher" : "Add a teacher"}
        description={
          editing
            ? "Update this teacher's details and subjects."
            : "This creates both the staff record and a login account."
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
              {editing ? "Save changes" : "Create teacher"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required error={errors.firstName}>
            <Input
              value={form.firstName}
              error={!!errors.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="Bilal"
            />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <Input
              value={form.lastName}
              error={!!errors.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Ahmed"
            />
          </Field>
        </div>

        {!editing && (
          <>
            <Field label="Email" required error={errors.email} hint="Used as the login username">
              <Input
                type="email"
                value={form.email}
                error={!!errors.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="teacher@school.edu"
              />
            </Field>
            <Field
              label="Temporary password"
              error={errors.password}
              hint="Leave blank to auto-generate one."
            >
              <Input
                type="text"
                value={form.password ?? ""}
                error={!!errors.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Optional"
              />
            </Field>
          </>
        )}

        <Field label="Phone">
          <Input
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+92 300 0000000"
          />
        </Field>

        <Field
          label="Subjects taught"
          hint="Subject codes this teacher is qualified to teach. Press Enter to add."
        >
          <CodeEditor
            codes={form.subjectCodes ?? []}
            onChange={(codes) => setForm({ ...form, subjectCodes: codes })}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm) await removeMutation.mutateAsync(confirm.id);
          setConfirm(null);
        }}
        busy={removeMutation.isPending}
        title="Deactivate teacher"
        confirmLabel="Deactivate"
        message={
          <>
            Deactivate{" "}
            <strong className="text-foreground">
              {confirm?.firstName} {confirm?.lastName}
            </strong>{" "}
            ({confirm?.employeeId})? Their login is disabled but past records are preserved.
          </>
        }
      />
    </AppLayout>
  );
}
