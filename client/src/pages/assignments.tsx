import { useState } from "react";
import { CheckCircle2, ClipboardList, Clock, Plus, Send, Trash2 } from "lucide-react";
import type { Assignment, Subject } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { ConfirmDialog, Field, Modal, Select, Textarea } from "@/components/form";
import { assessmentApi } from "@/api/assessment";
import { subjectsApi } from "@/api/resources";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useListState, usePaginatedQuery } from "@/lib/crud";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AssignmentsPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "teacher";
  return isStaff ? <StaffAssignments /> : <StudentAssignments />;
}

/* ------------------------------------------------------------- staff view */

function StaffAssignments() {
  const qc = useQueryClient();
  const listState = useListState({ sortBy: "dueDate", sortDir: "desc" });
  const list = usePaginatedQuery<Assignment>(["assignments", listState.query], () =>
    assessmentApi.listAssignments(listState.query),
  );

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Assignment | null>(null);
  const [grading, setGrading] = useState<Assignment | null>(null);
  const [form, setForm] = useState({
    subjectId: "",
    title: "",
    description: "",
    dueDate: "",
    maxMarks: 100,
  });

  const subjects = useQuery({
    queryKey: ["subjects-all"],
    queryFn: () => subjectsApi.list({ limit: 100 }),
  });

  const create = useMutation({
    mutationFn: () =>
      assessmentApi.createAssignment({
        ...form,
        dueDate: new Date(form.dueDate).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      toast.success("Assignment created");
      setOpen(false);
      setForm({ subjectId: "", title: "", description: "", dueDate: "", maxMarks: 100 });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => assessmentApi.removeAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      toast.success("Assignment removed");
      setConfirm(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const options = (subjects.data?.items ?? []).map((s: Subject) => ({
    value: s.id,
    label: `${s.code} — ${s.name}`,
  }));

  return (
    <AppLayout title="Assignments">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Assignments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create work and grade submissions. Late submissions are detected from the due date.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New assignment
          </Button>
        </div>

        <Input
          placeholder="Search assignments…"
          value={listState.query.search ?? ""}
          onChange={(e) => listState.setSearch(e.target.value)}
        />

        {list.isLoading && <Loading />}

        {list.items.length === 0 && !list.isLoading && (
          <Empty text="No assignments yet." />
        )}

        <div className="space-y-3">
          {list.items.map((a) => {
            const overdue = new Date(a.dueDate) < new Date();
            return (
              <Card key={a.id} className="group">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-medium text-foreground">
                        {a.title}
                      </h3>
                      <Badge tone="default">{a.maxMarks} marks</Badge>
                      {overdue && <Badge tone="warning">Past due</Badge>}
                    </div>
                    {a.subjectName && (
                      <p className="mt-1 text-xs text-primary">{a.subjectName}</p>
                    )}
                    {a.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Due{" "}
                      {new Date(a.dueDate).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => setGrading(a)}>
                      <ClipboardList className="size-3.5" /> Grade
                    </Button>
                    <button
                      onClick={() => setConfirm(a)}
                      aria-label="Delete assignment"
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
        title="New assignment"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              isLoading={create.isPending}
              disabled={!form.subjectId || !form.title.trim() || !form.dueDate}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Subject">
          <Select
            value={form.subjectId}
            onChange={(v: string) => setForm({ ...form, subjectId: v })}
            options={options}
            placeholder="Select a subject"
          />
        </Field>
        <Field label="Title">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Chapter 4 exercises"
          />
        </Field>
        <Field label="Instructions" hint="Optional.">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            placeholder="What should students do?"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </Field>
          <Field label="Max marks">
            <Input
              type="number"
              min={1}
              max={1000}
              value={form.maxMarks}
              onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })}
            />
          </Field>
        </div>
      </Modal>

      <GradingModal assignment={grading} onClose={() => setGrading(null)} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.id)}
        busy={remove.isPending}
        title="Remove assignment"
        confirmLabel="Remove"
        message={
          <>
            Remove <strong className="text-foreground">{confirm?.title}</strong>? Students will no
            longer see it.
          </>
        }
      />
    </AppLayout>
  );
}

/* ---------------------------------------------------------- grading modal */

function GradingModal({
  assignment,
  onClose,
}: {
  assignment: Assignment | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const subs = useQuery({
    queryKey: ["submissions", assignment?.id],
    queryFn: () => assessmentApi.submissions(assignment!.id),
    enabled: !!assignment,
  });

  const grade = useMutation({
    mutationFn: (vars: { id: string; marks: number; feedback?: string }) =>
      assessmentApi.grade(vars.id, { marks: vars.marks, feedback: vars.feedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      toast.success("Grade saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open={!!assignment}
      onClose={onClose}
      title={`Submissions — ${assignment?.title ?? ""}`}
      description="Enter marks out of the assignment maximum and save each row."
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {subs.isLoading && <Loading />}

      {subs.data && subs.data.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No submissions yet.
        </p>
      )}

      <div className="space-y-3">
        {subs.data?.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-secondary/30 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{s.studentName}</span>
              {s.isLate ? (
                <Badge tone="warning">
                  <Clock className="mr-1 size-3" /> Late
                </Badge>
              ) : (
                <Badge tone="success">On time</Badge>
              )}
              {s.marks !== undefined && <Badge tone="primary">Graded {s.marks}</Badge>}
            </div>

            {s.content && (
              <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{s.content}</p>
            )}
            {s.fileUrl && (
              <a
                href={s.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-primary hover:underline"
              >
                View submitted link
              </a>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-24">
                <Input
                  type="number"
                  min={0}
                  max={s.maxMarks}
                  placeholder={`/${s.maxMarks}`}
                  value={marks[s.id] ?? (s.marks !== undefined ? String(s.marks) : "")}
                  onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value })}
                />
              </div>
              <div className="min-w-40 flex-1">
                <Input
                  placeholder="Feedback (optional)"
                  value={feedback[s.id] ?? s.feedback ?? ""}
                  onChange={(e) => setFeedback({ ...feedback, [s.id]: e.target.value })}
                />
              </div>
              <Button
                size="sm"
                isLoading={grade.isPending}
                disabled={marks[s.id] === undefined && s.marks === undefined}
                onClick={() =>
                  grade.mutate({
                    id: s.id,
                    marks: Number(marks[s.id] ?? s.marks),
                    ...(feedback[s.id] ? { feedback: feedback[s.id] } : {}),
                  })
                }
              >
                <CheckCircle2 className="size-3.5" /> Save
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- student view */

function StudentAssignments() {
  const qc = useQueryClient();
  const listState = useListState({ sortBy: "dueDate", sortDir: "desc" });
  const list = usePaginatedQuery<Assignment>(["assignments", listState.query], () =>
    assessmentApi.listAssignments(listState.query),
  );
  const [submitting, setSubmitting] = useState<Assignment | null>(null);
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      assessmentApi.submit(submitting!.id, {
        ...(content.trim() ? { content } : {}),
        ...(fileUrl.trim() ? { fileUrl } : {}),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      toast.success(res.isLate ? "Submitted (marked late)" : "Submitted");
      setSubmitting(null);
      setContent("");
      setFileUrl("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <AppLayout title="Assignments">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">My assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit your work before the due date — late submissions are flagged automatically.
          </p>
        </div>

        {list.isLoading && <Loading />}
        {list.items.length === 0 && !list.isLoading && <Empty text="No assignments yet." />}

        <div className="space-y-3">
          {list.items.map((a) => {
            const overdue = new Date(a.dueDate) < new Date();
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-medium text-foreground">
                        {a.title}
                      </h3>
                      <Badge tone="default">{a.maxMarks} marks</Badge>
                      {overdue && <Badge tone="warning">Past due</Badge>}
                    </div>
                    {a.subjectName && <p className="mt-1 text-xs text-primary">{a.subjectName}</p>}
                    {a.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Due{" "}
                      {new Date(a.dueDate).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={overdue ? "outline" : "primary"}
                    onClick={() => setSubmitting(a)}
                  >
                    <Send className="size-3.5" /> Submit
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!submitting}
        onClose={() => setSubmitting(null)}
        title={`Submit — ${submitting?.title ?? ""}`}
        description="Provide your answer, a link to your work, or both."
        footer={
          <>
            <Button variant="outline" onClick={() => setSubmitting(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => submit.mutate()}
              isLoading={submit.isPending}
              disabled={!content.trim() && !fileUrl.trim()}
            >
              Submit
            </Button>
          </>
        }
      >
        <Field label="Your answer">
          <Textarea
            rows={5}
            value={content}
            onChange={setContent}
            placeholder="Type your response…"
          />
        </Field>
        <Field label="Link" hint="Optional — a URL to your work.">
          <Input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </Modal>
    </AppLayout>
  );
}

/* -------------------------------------------------------------- fragments */

function Loading() {
  return (
    <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
      <Spinner /> Loading…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <div className="py-14 text-center">
        <ClipboardList className="mx-auto mb-3 size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </Card>
  );
}
