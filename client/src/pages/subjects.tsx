import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ClassSection, Subject, SubjectInput, Teacher } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Input } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Field, Modal, Select, ConfirmDialog } from "@/components/form";
import { classesApi, subjectsApi, teachersApi } from "@/api/resources";
import { useListState, usePaginatedQuery, useCrudMutations } from "@/lib/crud";
import { useAuth } from "@/features/auth/auth-context";
import { useQuery } from "@tanstack/react-query";

const emptyForm: SubjectInput = {
  name: "",
  code: "",
  creditHours: 3,
  classSectionId: "",
  teacherId: "",
};

export default function SubjectsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const list = useListState({ sortBy: "code", sortDir: "asc" });

  const query = usePaginatedQuery<Subject>(["subjects", list.query], () =>
    subjectsApi.list(list.query),
  );

  const classesQuery = useQuery({
    queryKey: ["classes-all"],
    queryFn: () => classesApi.list({ limit: 100 }),
  });
  const teachersQuery = useQuery({
    queryKey: ["teachers-all"],
    queryFn: () => teachersApi.list({ limit: 100 }),
    enabled: isAdmin,
  });

  const { createMutation, updateMutation, removeMutation } = useCrudMutations({
    entity: "Subject",
    invalidateKeys: [["subjects"]],
    create: subjectsApi.create,
    update: subjectsApi.update,
    remove: subjectsApi.remove,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<SubjectInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Subject | null>(null);

  const classOptions = (classesQuery.data?.items ?? []).map((c: ClassSection) => ({
    value: c.id,
    label: `${c.gradeLevel} ${c.section}`,
  }));

  const teacherOptions = (teachersQuery.data?.items ?? []).map((t: Teacher) => ({
    value: t.userId,
    label: `${t.firstName} ${t.lastName} (${t.employeeId})`,
  }));

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(s: Subject) {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code,
      creditHours: s.creditHours,
      classSectionId: s.classSectionId ?? "",
      teacherId: s.teacherId ?? "",
    });
    setErrors({});
    setModalOpen(true);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Subject name is required";
    if (!form.code.trim()) e.code = "Subject code is required";
    else if (!/^[A-Za-z0-9-]+$/.test(form.code))
      e.code = "Only letters, numbers and dashes allowed";
    if (form.creditHours < 0) e.creditHours = "Cannot be negative";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit() {
    if (!validate()) return;
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      creditHours: Number(form.creditHours),
      classSectionId: form.classSectionId || undefined,
      teacherId: form.teacherId || undefined,
    };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, input: payload as never });
    } else {
      await createMutation.mutateAsync(payload as never);
    }
    setModalOpen(false);
  }

  const columns: Column<Subject>[] = [
    {
      key: "code",
      header: "Code",
      sortable: true,
      render: (s) => (
        <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">
          {s.code}
        </span>
      ),
    },
    {
      key: "name",
      header: "Subject",
      sortable: true,
      render: (s) => <span className="font-medium text-foreground">{s.name}</span>,
    },
    {
      key: "classSectionName",
      header: "Class",
      hideBelow: "sm",
      render: (s) =>
        s.classSectionName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      key: "teacherName",
      header: "Teacher",
      hideBelow: "md",
      render: (s) => s.teacherName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      key: "creditHours",
      header: "Credits",
      sortable: true,
      hideBelow: "lg",
      render: (s) => s.creditHours,
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (s: Subject) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => openEdit(s)}
                  aria-label={`Edit ${s.code}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setConfirm(s)}
                  aria-label={`Delete ${s.code}`}
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
    <AppLayout title="Subjects">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Subjects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Subjects link a class to a teacher. Codes must be unique within a term.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={query.items}
          rowKey={(s) => s.id}
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
          searchPlaceholder="Search by name or code…"
          emptyTitle="No subjects yet"
          emptyDescription={
            isAdmin
              ? "Add a subject and assign it to a class and teacher."
              : "No subjects have been created yet."
          }
          emptyAction={isAdmin ? <Button onClick={openCreate}><Plus className="size-4" /> New subject</Button> : undefined}
          actions={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> New subject
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
        title={editing ? "Edit subject" : "New subject"}
        description="A subject belongs to one class and is taught by one teacher."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editing ? "Save changes" : "Create subject"}
            </Button>
          </>
        }
      >
        <Field label="Subject name" required error={errors.name}>
          <Input
            value={form.name}
            error={!!errors.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Mathematics"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Code" required error={errors.code} hint="Uppercase, e.g. MATH-10">
            <Input
              value={form.code}
              error={!!errors.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="MATH-10"
              className="font-mono"
            />
          </Field>
          <Field label="Credit hours" required error={errors.creditHours}>
            <Input
              type="number"
              min={0}
              max={20}
              value={String(form.creditHours)}
              error={!!errors.creditHours}
              onChange={(e) => setForm({ ...form, creditHours: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Class">
          <Select
            value={form.classSectionId ?? ""}
            onChange={(v) => setForm({ ...form, classSectionId: v })}
            options={classOptions}
            placeholder="Unassigned"
          />
        </Field>

        <Field label="Teacher">
          <Select
            value={form.teacherId ?? ""}
            onChange={(v) => setForm({ ...form, teacherId: v })}
            options={teacherOptions}
            placeholder="Unassigned"
            disabled={!isAdmin}
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
        title="Delete subject"
        confirmLabel="Delete subject"
        message={
          <>
            Delete <strong className="text-foreground">{confirm?.code}</strong> —{" "}
            {confirm?.name}? Attendance and grades referencing it would be affected.
          </>
        }
      />
    </AppLayout>
  );
}
