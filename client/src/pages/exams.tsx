import { useEffect, useState } from "react";
import { CalendarDays, FileSpreadsheet, Plus, Save, Trash2 } from "lucide-react";
import type { Exam, Subject } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { ConfirmDialog, Field, Modal, Select } from "@/components/form";
import { assessmentApi } from "@/api/assessment";
import { studentsApi, subjectsApi } from "@/api/resources";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useListState, usePaginatedQuery } from "@/lib/crud";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ExamsPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "teacher";
  return isStaff ? <StaffExams /> : <StudentResults />;
}

/* ------------------------------------------------------------- staff view */

function StaffExams() {
  const qc = useQueryClient();
  const listState = useListState({ sortBy: "examDate", sortDir: "desc" });
  const list = usePaginatedQuery<Exam>(["exams", listState.query], () =>
    assessmentApi.listExams(listState.query),
  );

  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Exam | null>(null);
  const [confirm, setConfirm] = useState<Exam | null>(null);
  const [form, setForm] = useState({ subjectId: "", name: "", examDate: "", maxMarks: 100 });

  const subjects = useQuery({
    queryKey: ["subjects-all"],
    queryFn: () => subjectsApi.list({ limit: 100 }),
  });

  const create = useMutation({
    mutationFn: () =>
      assessmentApi.createExam({
        ...form,
        examDate: new Date(form.examDate).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam created");
      setOpen(false);
      setForm({ subjectId: "", name: "", examDate: "", maxMarks: 100 });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => assessmentApi.removeExam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam removed");
      setConfirm(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const options = (subjects.data?.items ?? []).map((s: Subject) => ({
    value: s.id,
    label: `${s.code} — ${s.name}`,
  }));

  return (
    <AppLayout title="Exams & Grades">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Exams & grades</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Record exam marks for a whole class in one sheet. Marks feed directly into report
              cards.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New exam
          </Button>
        </div>

        {list.isLoading && <Loading />}
        {list.items.length === 0 && !list.isLoading && (
          <Card>
            <div className="py-14 text-center">
              <FileSpreadsheet className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No exams scheduled yet.</p>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {list.items.map((e) => (
            <Card key={e.id} className="group">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-medium text-foreground">{e.name}</h3>
                    <Badge tone="default">{e.maxMarks} marks</Badge>
                  </div>
                  {e.subjectName && <p className="mt-1 text-xs text-primary">{e.subjectName}</p>}
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" />
                    {new Date(e.examDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSheet(e)}>
                    <FileSpreadsheet className="size-3.5" /> Enter marks
                  </Button>
                  <button
                    onClick={() => setConfirm(e)}
                    aria-label="Delete exam"
                    className="rounded p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New exam"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              isLoading={create.isPending}
              disabled={!form.subjectId || !form.name.trim() || !form.examDate}
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
        <Field label="Exam name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Midterm — Physics"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam date">
            <Input
              type="date"
              value={form.examDate}
              onChange={(e) => setForm({ ...form, examDate: e.target.value })}
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

      <MarksSheet exam={sheet} onClose={() => setSheet(null)} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.id)}
        busy={remove.isPending}
        title="Remove exam"
        confirmLabel="Remove"
        message={
          <>
            Remove <strong className="text-foreground">{confirm?.name}</strong> and all its recorded
            marks?
          </>
        }
      />
    </AppLayout>
  );
}

/* ------------------------------------------------------------ marks sheet */

function MarksSheet({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, string>>({});

  const sheet = useQuery({
    queryKey: ["exam-sheet", exam?.id],
    queryFn: () => assessmentApi.examSheet(exam!.id),
    enabled: !!exam,
  });

  // Seed the inputs from the server whenever the sheet loads.
  useEffect(() => {
    if (!sheet.data) return;
    const next: Record<string, string> = {};
    for (const r of sheet.data.rows) {
      if (r.marks !== null) next[r.studentId] = String(r.marks);
    }
    setMarks(next);
  }, [sheet.data]);

  const save = useMutation({
    mutationFn: () =>
      assessmentApi.saveMarks(
        exam!.id,
        sheet.data!.rows
          .filter((r) => marks[r.studentId] !== undefined && marks[r.studentId] !== "")
          .map((r) => ({ studentId: r.studentId, marks: Number(marks[r.studentId]) })),
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["exam-sheet"] });
      qc.invalidateQueries({ queryKey: ["report-card"] });
      toast.success(`${res.marked} marks saved`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const entered = sheet.data?.rows.filter(
    (r) => marks[r.studentId] !== undefined && marks[r.studentId] !== "",
  ).length;

  return (
    <Modal
      open={!!exam}
      onClose={onClose}
      title={`Marks — ${exam?.name ?? ""}`}
      description={
        sheet.data ? `Out of ${sheet.data.maxMarks}. Leave blank to skip a student.` : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            isLoading={save.isPending}
            disabled={!entered}
          >
            <Save className="size-4" /> Save marks
          </Button>
        </>
      }
    >
      {sheet.isLoading && <Loading />}
      {sheet.isError && (
        <p className="py-6 text-sm text-destructive">
          {sheet.error ? errorMessage(sheet.error) : "Could not load the sheet."}
        </p>
      )}

      {sheet.data && sheet.data.rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          This subject has no enrolled students.
        </p>
      )}

      {sheet.data && sheet.data.rows.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {entered} of {sheet.data.rows.length} entered
            </span>
            {sheet.data.alreadyEntered && <Badge tone="warning">Already entered — editing</Badge>}
          </div>
          <ul className="divide-y divide-border">
            {sheet.data.rows.map((r) => (
              <li key={r.studentId} className="flex items-center gap-3 py-2.5">
                <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                  {r.rollNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.name}</span>
                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    max={sheet.data!.maxMarks}
                    placeholder="—"
                    value={marks[r.studentId] ?? ""}
                    onChange={(e) => setMarks({ ...marks, [r.studentId]: e.target.value })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------- student view */

function StudentResults() {
  const results = useQuery({ queryKey: ["my-results"], queryFn: () => assessmentApi.myResults() });
  const me = useQuery({
    queryKey: ["student-me"],
    queryFn: () => studentsApi.me(),
  });
  const card = useQuery({
    queryKey: ["report-card", me.data?.id],
    queryFn: () => assessmentApi.reportCard(me.data!.id),
    enabled: !!me.data?.id,
  });

  return (
    <AppLayout title="Exams & Grades">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">My results</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your exam marks and overall report card.
          </p>
        </div>

        {card.data && card.data.subjects.length > 0 && (
          <Card>
            <div className="flex flex-wrap items-center gap-8">
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Overall</p>
                <p className="mt-1 font-display text-4xl font-semibold text-foreground">
                  {card.data.overallGrade}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.data.overallPercentage}% · {card.data.totalObtained}/{card.data.totalMax}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {card.data.subjects.map((s) => (
                  <div key={s.subjectId} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {s.subjectName}
                    </span>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${s.percentage}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm text-foreground">{s.grade}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {results.isLoading && <Loading />}

        {results.data && results.data.length === 0 && (
          <Card>
            <div className="py-14 text-center">
              <FileSpreadsheet className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No results published yet.</p>
            </div>
          </Card>
        )}

        {results.data && results.data.length > 0 && (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {results.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{r.examName}</p>
                    <p className="text-xs text-muted-foreground">{r.subjectName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.examDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  <span className="font-mono text-sm text-foreground">
                    {r.marks}/{r.maxMarks}
                  </span>
                  <Badge tone={r.percentage >= 70 ? "success" : r.percentage >= 50 ? "warning" : "danger"}>
                    {r.grade}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
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
