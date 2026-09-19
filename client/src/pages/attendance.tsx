import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Save, Users } from "lucide-react";
import type { AttendanceStatus, AttendanceRegisterView } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, CardHeader, Input, Spinner } from "@/components/ui";
import { Field, Select } from "@/components/form";
import { attendanceApi } from "@/api/phase4";
import { studentsApi, subjectsApi } from "@/api/resources";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage } from "@/lib/crud";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

/** Colour + label per status, used by both the buttons and the summary chips. */
const STATUS_META: Record<AttendanceStatus, { label: string; short: string; cls: string }> = {
  present: {
    label: "Present",
    short: "P",
    cls: "bg-success/20 text-success border-success/40",
  },
  absent: {
    label: "Absent",
    short: "A",
    cls: "bg-destructive/20 text-destructive border-destructive/40",
  },
  late: { label: "Late", short: "L", cls: "bg-warning/20 text-warning border-warning/40" },
  excused: { label: "Excused", short: "E", cls: "bg-primary/20 text-primary border-primary/40" },
};

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const qc = useQueryClient();

  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(todayISO());
  /** Local, editable copy of the register — only pushed to the server on save. */
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});

  // For a student, offer the subjects of their own class.
  const subjectsQuery = useQuery({
    queryKey: ["subjects-for-attendance"],
    queryFn: () => subjectsApi.list({ limit: 100 }),
  });

  const subjects = subjectsQuery.data?.items ?? [];
  const selected = subjects.find((s) => s.id === subjectId);

  // Default to the first subject once loaded.
  useEffect(() => {
    if (!subjectId && subjects.length > 0) setSubjectId(subjects[0]!.id);
  }, [subjects, subjectId]);

  const register = useQuery({
    queryKey: ["attendance-register", subjectId, date],
    queryFn: () => attendanceApi.register(subjectId, date),
    enabled: !!subjectId && !!date,
  });

  // Seed the draft whenever a new register arrives.
  useEffect(() => {
    if (!register.data) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const row of register.data.rows) next[row.studentId] = row.status;
    setDraft(next);
  }, [register.data]);

  const save = useMutation({
    mutationFn: (view: AttendanceRegisterView) =>
      attendanceApi.mark({
        subjectId: view.subjectId,
        date,
        entries: view.rows.map((r) => ({
          studentId: r.studentId,
          status: draft[r.studentId] ?? r.status,
        })),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["attendance-register"] });
      toast.success(
        res.created > 0
          ? `Register saved — ${res.marked} students marked`
          : `Register updated — ${res.marked} students`,
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const view = register.data;
  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    if (!view) return counts;
    for (const row of view.rows) counts[draft[row.studentId] ?? row.status] += 1;
    return counts;
  }, [view, draft]);

  const setAll = (status: AttendanceStatus) => {
    if (!view) return;
    setDraft(Object.fromEntries(view.rows.map((r) => [r.studentId, status])));
  };

  // A student sees their own summary instead of a marking grid.
  if (isStudent) return <MyAttendance />;

  return (
    <AppLayout title="Attendance">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark a full class register for a subject and date. A student can have one record per
            subject per day — re-saving updates rather than duplicating.
          </p>
        </div>

        {/* Controls */}
        <Card>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <Field label="Subject">
              <Select
                value={subjectId}
                onChange={setSubjectId}
                options={subjects.map((s) => ({
                  value: s.id,
                  label: `${s.code} — ${s.name}${s.classSectionName ? ` (${s.classSectionName})` : ""}`,
                }))}
                placeholder={subjects.length ? "Select a subject" : "No subjects available"}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate(view!)}
                isLoading={save.isPending}
                disabled={!view || view.rows.length === 0}
              >
                <Save className="size-4" />
                {view?.alreadyMarked ? "Update register" : "Save register"}
              </Button>
            </div>
          </div>
          {selected?.classSectionName && (
            <p className="mt-3 text-xs text-muted-foreground">
              Class: <span className="text-foreground">{selected.classSectionName}</span>
              {view?.alreadyMarked && (
                <Badge tone="warning" className="ml-2">
                  Already marked — editing
                </Badge>
              )}
            </p>
          )}
        </Card>

        {/* Register */}
        {register.isLoading && (
          <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
            <Spinner /> Loading register…
          </div>
        )}

        {register.isError && (
          <Card>
            <p className="text-sm text-destructive">
              {register.error ? errorMessage(register.error) : "Could not load the register."}
            </p>
          </Card>
        )}

        {view && (
          <>
            {/* Bulk actions + live counts */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs tracking-wide text-muted-foreground uppercase">
                Mark all:
              </span>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setAll(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    STATUS_META[s].cls,
                  )}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-3 text-xs">
                {STATUSES.map((s) => (
                  <span key={s} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{summary[s]}</span>{" "}
                    {STATUS_META[s].short}
                  </span>
                ))}
              </div>
            </div>

            <Card className="p-0">
              {view.rows.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Users className="mx-auto mb-3 size-5 text-muted-foreground" />
                  <p className="font-medium text-foreground">No students enrolled</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This subject's class has no active students yet.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {view.rows.map((row) => {
                    const current = draft[row.studentId] ?? row.status;
                    return (
                      <li
                        key={row.studentId}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                      >
                        <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                          {row.rollNumber}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {row.name}
                        </span>
                        <div className="flex gap-1.5">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() =>
                                setDraft((d) => ({ ...d, [row.studentId]: s }))
                              }
                              aria-label={`${row.name}: ${STATUS_META[s].label}`}
                              aria-pressed={current === s}
                              title={STATUS_META[s].label}
                              className={cn(
                                "grid size-8 place-items-center rounded-lg border text-xs font-semibold transition-colors",
                                current === s
                                  ? STATUS_META[s].cls
                                  : "border-border text-muted-foreground hover:bg-secondary/60",
                              )}
                            >
                              {STATUS_META[s].short}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ *
 * Student's own attendance view
 * ------------------------------------------------------------------ */

function MyAttendance() {
  const me = useQuery({
    queryKey: ["student-me"],
    queryFn: () => studentsApi.me(),
  });

  const studentId = me.data?.id;

  const summary = useQuery({
    queryKey: ["attendance-summary", studentId],
    queryFn: () => attendanceApi.summary(studentId!),
    enabled: !!studentId,
  });

  const history = useQuery({
    queryKey: ["attendance-history", studentId],
    queryFn: () => attendanceApi.history({ studentId: studentId!, limit: 30 }),
    enabled: !!studentId,
  });

  const subjects = useQuery({
    queryKey: ["subjects-for-attendance"],
    queryFn: () => subjectsApi.list({ limit: 100 }),
  });
  const subjectName = (id: string) =>
    subjects.data?.items.find((s) => s.id === id)?.name ?? "Subject";

  if (me.isLoading || summary.isLoading) {
    return (
      <AppLayout title="My Attendance">
        <div className="flex items-center gap-3 py-20 text-sm text-muted-foreground">
          <Spinner /> Loading your attendance…
        </div>
      </AppLayout>
    );
  }

  const s = summary.data;

  return (
    <AppLayout title="My Attendance">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">My attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your overall record across all subjects. Late arrivals count as attended.
          </p>
        </div>

        {s && (
          <>
            <Card>
              <div className="flex flex-wrap items-center gap-8">
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    Overall
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-display text-4xl font-semibold",
                      s.percentage >= 85
                        ? "text-success"
                        : s.percentage >= 70
                          ? "text-warning"
                          : "text-destructive",
                    )}
                  >
                    {s.percentage}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.present + s.late} of {s.total} sessions attended
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                  {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map((k) => (
                    <div key={k}>
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        {STATUS_META[k].label}
                      </p>
                      <p className="mt-1 font-display text-xl text-foreground">{s[k]}</p>
                    </div>
                  ))}
                </div>
              </div>
              {s.total > 0 && (
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-success"
                    style={{ width: `${(s.present / s.total) * 100}%` }}
                  />
                  <div
                    className="-mt-2 h-2 bg-warning"
                    style={{ width: `${(s.late / s.total) * 100}%` }}
                  />
                </div>
              )}
            </Card>

            {s.total === 0 && (
              <Card>
                <div className="py-8 text-center">
                  <CalendarCheck className="mx-auto mb-3 size-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No attendance has been recorded for you yet.
                  </p>
                </div>
              </Card>
            )}
          </>
        )}

        {history.data && history.data.items.length > 0 && (
          <Card className="p-0">
            <div className="border-b border-border px-5 py-4">
              <CardHeader title="Recent records" description="Your most recent 30 sessions." />
            </div>
            <ul className="divide-y divide-border">
              {history.data.items.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {new Date(r.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {subjectName(r.subjectId)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      STATUS_META[r.status].cls,
                    )}
                  >
                    {STATUS_META[r.status].label}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
