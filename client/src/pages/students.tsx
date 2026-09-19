import { useState } from "react";
import { Plus, Pencil, Trash2, GraduationCap, Mail, Phone, MapPin, UserRound } from "lucide-react";
import type { ClassSection, Student, StudentCreateInput } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Input, Card, CardHeader, Spinner } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Field, Modal, Select, ConfirmDialog, Textarea } from "@/components/form";
import { classesApi, studentsApi } from "@/api/resources";
import { useListState, usePaginatedQuery, useCrudMutations, errorMessage } from "@/lib/crud";
import { useAuth } from "@/features/auth/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/cn";
import { toast } from "sonner";

/* ------------------------------------------------------------------ *
 * Student's own profile — the self-service view
 * ------------------------------------------------------------------ */

function MyProfile() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: "", address: "", guardianName: "", guardianPhone: "" });

  const me = useQuery({ queryKey: ["student-me"], queryFn: studentsApi.me });

  const save = useMutation({
    mutationFn: () => studentsApi.updateMe(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-me"] });
      toast.success("Profile updated");
      setEditing(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function startEdit() {
    if (!me.data) return;
    setForm({
      phone: me.data.phone ?? "",
      address: me.data.address ?? "",
      guardianName: me.data.guardianName ?? "",
      guardianPhone: me.data.guardianPhone ?? "",
    });
    setEditing(true);
  }

  if (me.isLoading) {
    return (
      <AppLayout title="My Profile">
        <div className="flex items-center gap-3 py-20 text-sm text-muted-foreground">
          <Spinner /> Loading your profile…
        </div>
      </AppLayout>
    );
  }

  if (me.isError || !me.data) {
    return (
      <AppLayout title="My Profile">
        <Card className="mx-auto max-w-xl">
          <p className="text-sm text-destructive">
            {me.error ? errorMessage(me.error) : "Your student profile could not be loaded."}
          </p>
        </Card>
      </AppLayout>
    );
  }

  const s = me.data;

  return (
    <AppLayout title="My Profile">
      <div className="mx-auto max-w-3xl space-y-5">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
                {s.firstName.charAt(0)}
                {s.lastName.charAt(0)}
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {s.firstName} {s.lastName}
                </h2>
                <p className="font-mono text-xs text-muted-foreground">{s.rollNumber}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {s.classSectionName && (
                    <Badge tone="primary">
                      <GraduationCap className="mr-1 size-3" />
                      {s.classSectionName}
                    </Badge>
                  )}
                  {!s.isActive && <Badge tone="warning">Inactive</Badge>}
                </div>
              </div>
            </div>
            {!editing && (
              <Button variant="outline" onClick={startEdit}>
                <Pencil className="size-4" /> Edit contact details
              </Button>
            )}
          </div>

          {/* Read-only academic fields — the student cannot change these. */}
          <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
            <ReadOnly label="Roll number" value={s.rollNumber} />
            <ReadOnly label="Class" value={s.classSectionName ?? "Unassigned"} />
            <ReadOnly label="Enrolled" value={formatDate(s.enrolledAt)} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Contact details"
            description="You can keep your own contact information up to date. Academic records are managed by the school office."
          />

          {editing ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your phone">
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+92 300 0000000"
                  />
                </Field>
                <Field label="Guardian phone">
                  <Input
                    value={form.guardianPhone}
                    onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                    placeholder="+92 300 0000000"
                  />
                </Field>
              </div>
              <Field label="Guardian name">
                <Input
                  value={form.guardianName}
                  onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                  placeholder="Guardian's full name"
                />
              </Field>
              <Field label="Address">
                <Textarea
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                  placeholder="House, street, city"
                  rows={2}
                />
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => save.mutate()} isLoading={save.isPending}>
                  Save changes
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail icon={<Mail className="size-3.5" />} label="Email" value={s.email} />
              <Detail
                icon={<Phone className="size-3.5" />}
                label="Phone"
                value={s.phone ?? "Not set"}
              />
              <Detail
                icon={<UserRound className="size-3.5" />}
                label="Guardian"
                value={s.guardianName ?? "Not set"}
              />
              <Detail
                icon={<Phone className="size-3.5" />}
                label="Guardian phone"
                value={s.guardianPhone ?? "Not set"}
              />
              <Detail
                icon={<MapPin className="size-3.5" />}
                label="Address"
                value={s.address ?? "Not set"}
              />
            </dl>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-foreground">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Admin / teacher list view
 * ------------------------------------------------------------------ */

const emptyCreate: StudentCreateInput = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  guardianName: "",
  guardianPhone: "",
  classSectionId: "",
};

function StudentList() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const list = useListState({ sortBy: "rollNumber", sortDir: "asc" });

  const query = usePaginatedQuery<Student>(["students", list.query], () =>
    studentsApi.list(list.query),
  );

  const classesQuery = useQuery({
    queryKey: ["classes-all"],
    queryFn: () => classesApi.list({ limit: 100 }),
  });

  const { createMutation, updateMutation, removeMutation } = useCrudMutations({
    entity: "Student",
    invalidateKeys: [["students"]],
    create: studentsApi.create,
    update: studentsApi.update,
    remove: studentsApi.remove,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentCreateInput>(emptyCreate);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Student | null>(null);

  const classOptions = (classesQuery.data?.items ?? []).map((c: ClassSection) => ({
    value: c.id,
    label: `${c.gradeLevel} ${c.section}`,
  }));

  function openCreate() {
    setEditing(null);
    setForm(emptyCreate);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      password: "",
      guardianName: s.guardianName ?? "",
      guardianPhone: s.guardianPhone ?? "",
      classSectionId: s.classSectionId ?? "",
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
          guardianName: form.guardianName || undefined,
          guardianPhone: form.guardianPhone || undefined,
          classSectionId: form.classSectionId || undefined,
        } as never,
      });
    } else {
      await createMutation.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        ...(form.password ? { password: form.password } : {}),
        guardianName: form.guardianName || undefined,
        guardianPhone: form.guardianPhone || undefined,
        classSectionId: form.classSectionId || undefined,
      } as never);
    }
    setModalOpen(false);
  }

  const columns: Column<Student>[] = [
    {
      key: "rollNumber",
      header: "Roll no.",
      sortable: true,
      render: (s) => <span className="font-mono text-xs">{s.rollNumber}</span>,
    },
    {
      key: "firstName",
      header: "Name",
      sortable: true,
      render: (s) => (
        <span className="font-medium text-foreground">
          {s.firstName} {s.lastName}
        </span>
      ),
    },
    {
      key: "classSectionName",
      header: "Class",
      hideBelow: "sm",
      render: (s) =>
        s.classSectionName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      key: "email",
      header: "Email",
      hideBelow: "md",
      render: (s) => <span className="text-muted-foreground">{s.email}</span>,
    },
    {
      key: "guardianName",
      header: "Guardian",
      hideBelow: "lg",
      render: (s) => s.guardianName ?? <span className="text-muted-foreground">—</span>,
    },
    ...(isAdmin
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (s: Student) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => openEdit(s)}
                  aria-label={`Edit ${s.firstName} ${s.lastName}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setConfirm(s)}
                  aria-label={`Deactivate ${s.firstName} ${s.lastName}`}
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
    <AppLayout title="Students">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Students</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Creating a student also creates their login. Roll numbers are generated automatically."
              : "Students in the classes you teach."}
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
          searchPlaceholder="Search by name, roll number or email…"
          emptyTitle="No students found"
          emptyDescription={
            isAdmin
              ? "Add your first student to get started."
              : "No students are enrolled in your classes yet."
          }
          emptyAction={isAdmin ? <Button onClick={openCreate}><Plus className="size-4" /> New student</Button> : undefined}
          actions={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> New student
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
        title={editing ? "Edit student" : "Enrol a new student"}
        description={
          editing
            ? "Update this student's details. Roll number and class are managed by the school office."
            : "This creates both the student record and a login account."
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
              {editing ? "Save changes" : "Create student"}
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
              placeholder="Hamza"
            />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <Input
              value={form.lastName}
              error={!!errors.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Raza"
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
                placeholder="student@school.edu"
              />
            </Field>
            <Field
              label="Temporary password"
              error={errors.password}
              hint="Leave blank to auto-generate one. At least 8 characters if set."
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

        <Field label="Class">
          <Select
            value={form.classSectionId ?? ""}
            onChange={(v) => setForm({ ...form, classSectionId: v })}
            options={classOptions}
            placeholder="Unassigned"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guardian name">
            <Input
              value={form.guardianName ?? ""}
              onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
              placeholder="Guardian's full name"
            />
          </Field>
          <Field label="Guardian phone">
            <Input
              value={form.guardianPhone ?? ""}
              onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
              placeholder="+92 300 0000000"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm) await removeMutation.mutateAsync(confirm.id);
          setConfirm(null);
        }}
        busy={removeMutation.isPending}
        title="Deactivate student"
        confirmLabel="Deactivate"
        message={
          <>
            Deactivate{" "}
            <strong className="text-foreground">
              {confirm?.firstName} {confirm?.lastName}
            </strong>{" "}
            ({confirm?.rollNumber})? Their record is kept for history and their login is disabled.
            This is reversible in the database, but not from this screen.
          </>
        }
      />
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */

export default function StudentsPage() {
  const { user } = useAuth();
  if (user?.role === "student") return <MyProfile />;
  return <StudentList />;
}
