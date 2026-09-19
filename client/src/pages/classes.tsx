import { useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import type { AcademicTerm, ClassSection, ClassSectionInput, Teacher } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Input } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Field, Modal, Select, ConfirmDialog } from "@/components/form";
import { classesApi, termsApi, teachersApi } from "@/api/resources";
import { useListState, usePaginatedQuery, useCrudMutations } from "@/lib/crud";
import { useAuth } from "@/features/auth/auth-context";
import { useQuery } from "@tanstack/react-query";

const emptyForm: ClassSectionInput = {
  gradeLevel: "",
  section: "",
  capacity: 30,
  classTeacherId: "",
  termId: "",
};

export default function ClassesPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const list = useListState({ sortBy: "gradeLevel", sortDir: "asc" });

  const query = usePaginatedQuery<ClassSection>(["classes", list.query], () =>
    classesApi.list(list.query),
  );

  // Dropdown sources. Teachers are admin-only, so only fetch when permitted.
  const termsQuery = useQuery({
    queryKey: ["terms-all"],
    queryFn: () => termsApi.list({ limit: 100 }),
  });
  const teachersQuery = useQuery({
    queryKey: ["teachers-all"],
    queryFn: () => teachersApi.list({ limit: 100 }),
    enabled: isAdmin,
  });

  const { createMutation, updateMutation, removeMutation } = useCrudMutations({
    entity: "Class",
    invalidateKeys: [["classes"]],
    create: classesApi.create,
    update: classesApi.update,
    remove: classesApi.remove,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSection | null>(null);
  const [form, setForm] = useState<ClassSectionInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ClassSection | null>(null);

  const termOptions = (termsQuery.data?.items ?? []).map((t: AcademicTerm) => ({
    value: t.id,
    label: `${t.name} (${t.academicYear})${t.isCurrent ? " — current" : ""}`,
  }));

  const teacherOptions = (teachersQuery.data?.items ?? []).map((t: Teacher) => ({
    value: t.userId,
    label: `${t.firstName} ${t.lastName} (${t.employeeId})`,
  }));

  function openCreate() {
    setEditing(null);
    // Default to the current term — the common case.
    const current = (termsQuery.data?.items ?? []).find((t: AcademicTerm) => t.isCurrent);
    setForm({ ...emptyForm, termId: current?.id ?? "" });
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(c: ClassSection) {
    setEditing(c);
    setForm({
      gradeLevel: c.gradeLevel,
      section: c.section,
      capacity: c.capacity,
      classTeacherId: c.classTeacherId ?? "",
      termId: c.termId ?? "",
    });
    setErrors({});
    setModalOpen(true);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.gradeLevel.trim()) e.gradeLevel = "Grade level is required";
    if (!form.section.trim()) e.section = "Section is required";
    if (!form.capacity || form.capacity < 1) e.capacity = "Capacity must be at least 1";
    if (form.capacity > 200) e.capacity = "Capacity must be 200 or fewer";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit() {
    if (!validate()) return;
    // Convert empty strings to undefined so the server treats them as "unset".
    const payload = {
      gradeLevel: form.gradeLevel.trim(),
      section: form.section.trim(),
      capacity: Number(form.capacity),
      classTeacherId: form.classTeacherId || undefined,
      termId: form.termId || undefined,
    };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, input: payload as never });
    } else {
      await createMutation.mutateAsync(payload as never);
    }
    setModalOpen(false);
  }

  const columns: Column<ClassSection>[] = [
    {
      key: "gradeLevel",
      header: "Class",
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {c.gradeLevel} {c.section}
          </span>
          {!c.isActive && <Badge tone="warning">Inactive</Badge>}
        </div>
      ),
    },
    {
      key: "classTeacherName",
      header: "Class teacher",
      hideBelow: "sm",
      render: (c) =>
        c.classTeacherName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      key: "studentCount",
      header: "Students",
      render: (c) => {
        const n = c.studentCount ?? 0;
        const full = n >= c.capacity;
        return (
          <span className={full ? "text-warning" : "text-foreground"}>
            {n} / {c.capacity}
            {full && <span className="ml-1.5 text-xs">(full)</span>}
          </span>
        );
      },
    },
    {
      key: "capacity",
      header: "Capacity",
      sortable: true,
      hideBelow: "md",
      render: (c) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, ((c.studentCount ?? 0) / c.capacity) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{c.capacity}</span>
        </div>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (c: ClassSection) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => openEdit(c)}
                  aria-label={`Edit ${c.gradeLevel} ${c.section}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setConfirm(c)}
                  aria-label={`Delete ${c.gradeLevel} ${c.section}`}
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
    <AppLayout title="Classes">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Classes & sections</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each class belongs to a term and has a capacity. A class with students assigned cannot
            be deleted.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={query.items}
          rowKey={(c) => c.id}
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
          searchPlaceholder="Search by grade or section…"
          emptyTitle="No classes yet"
          emptyDescription={
            isAdmin
              ? "Create a class to start assigning students and subjects."
              : "No classes have been created yet."
          }
          emptyAction={isAdmin ? <Button onClick={openCreate}><Plus className="size-4" /> New class</Button> : undefined}
          actions={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> New class
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
        title={editing ? "Edit class" : "New class"}
        description={
          editing
            ? "Capacity cannot be reduced below the number of students already assigned."
            : "Add a class section and optionally assign a class teacher."
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
              {editing ? "Save changes" : "Create class"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Grade level" required error={errors.gradeLevel}>
            <Input
              value={form.gradeLevel}
              error={!!errors.gradeLevel}
              onChange={(e) => setForm({ ...form, gradeLevel: e.target.value })}
              placeholder="e.g. Grade 10"
            />
          </Field>
          <Field label="Section" required error={errors.section}>
            <Input
              value={form.section}
              error={!!errors.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
              placeholder="A"
            />
          </Field>
        </div>

        <Field label="Capacity" required error={errors.capacity} hint="Maximum students (1–200)">
          <Input
            type="number"
            min={1}
            max={200}
            value={String(form.capacity)}
            error={!!errors.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
          />
        </Field>

        <Field label="Term" hint="Leave blank to create a term-independent class">
          <Select
            value={form.termId ?? ""}
            onChange={(v) => setForm({ ...form, termId: v })}
            options={termOptions}
            placeholder="No term"
          />
        </Field>

        <Field label="Class teacher" hint="Must be a user with the teacher role">
          <Select
            value={form.classTeacherId ?? ""}
            onChange={(v) => setForm({ ...form, classTeacherId: v })}
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
        title="Delete class"
        confirmLabel="Delete class"
        message={
          <>
            Delete{" "}
            <strong className="text-foreground">
              {confirm?.gradeLevel} {confirm?.section}
            </strong>
            ? This will be refused if any students or subjects still reference it —
            <Users className="mx-1 inline size-3.5" />
            move them to another class first.
          </>
        }
      />
    </AppLayout>
  );
}
