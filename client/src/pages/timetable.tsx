import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Trash2 } from "lucide-react";
import type { ClassSection, Subject, Teacher, TimetableSlotView, Weekday } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { ConfirmDialog, Field, Modal, Select } from "@/components/form";
import { timetableApi } from "@/api/phase4";
import { classesApi, subjectsApi, teachersApi } from "@/api/resources";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage } from "@/lib/crud";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const DAYS: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABEL: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
};

/** Candidate start times offered in the editor, on the half hour. */
const TIME_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

interface Draft {
  id?: string;
  classSectionId: string;
  subjectId: string;
  teacherId: string;
  day: Weekday;
  startTime: string;
  endTime: string;
}

export default function TimetablePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();

  const [classSectionId, setClassSectionId] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<TimetableSlotView | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  const classesQuery = useQuery({
    queryKey: ["classes-all"],
    queryFn: () => classesApi.list({ limit: 100 }),
    // Students and teachers see their own schedule without picking a class.
    enabled: isAdmin,
  });
  const subjectsQuery = useQuery({
    queryKey: ["subjects-all"],
    queryFn: () => subjectsApi.list({ limit: 100 }),
    enabled: isAdmin,
  });
  const teachersQuery = useQuery({
    queryKey: ["teachers-all"],
    queryFn: () => teachersApi.list({ limit: 100 }),
    enabled: isAdmin,
  });

  const slots = useQuery({
    queryKey: ["timetable", classSectionId, user?.role],
    queryFn: () => timetableApi.list(classSectionId ? { classSectionId } : {}),
  });

  // Group slots by day for the grid.
  const byDay = useMemo(() => {
    const map: Record<Weekday, TimetableSlotView[]> = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    };
    for (const s of slots.data ?? []) map[s.day]?.push(s);
    for (const d of DAYS) map[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [slots.data]);

  const save = useMutation({
    mutationFn: (draft: Draft) => {
      const payload = {
        classSectionId: draft.classSectionId,
        subjectId: draft.subjectId,
        teacherId: draft.teacherId,
        day: draft.day,
        startTime: draft.startTime,
        endTime: draft.endTime,
      };
      return draft.id ? timetableApi.update(draft.id, payload) : timetableApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable"] });
      toast.success(editing?.id ? "Slot updated" : "Slot added");
      setEditing(null);
      setConflicts([]);
    },
    onError: (e) => {
      // A 409 carries the specific clash messages — surface them inline.
      const msg = errorMessage(e);
      setConflicts(msg.split(/(?<=\.)\s+/).filter(Boolean));
      toast.error("Timetable conflict");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => timetableApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable"] });
      toast.success("Slot removed");
      setConfirm(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  /** Pre-flight check as the admin edits, so clashes show before saving. */
  const check = useQuery({
    queryKey: [
      "timetable-check",
      editing?.classSectionId,
      editing?.teacherId,
      editing?.day,
      editing?.startTime,
      editing?.endTime,
      editing?.id,
    ],
    queryFn: () =>
      timetableApi.check({
        classSectionId: editing!.classSectionId,
        teacherId: editing!.teacherId,
        day: editing!.day,
        startTime: editing!.startTime,
        endTime: editing!.endTime,
        ...(editing!.id ? { excludeSlotId: editing!.id } : {}),
      }),
    enabled:
      !!editing?.classSectionId &&
      !!editing?.teacherId &&
      !!editing?.startTime &&
      !!editing?.endTime &&
      editing.startTime < editing.endTime,
  });

  // Reset stale conflict banners when the form changes.
  useEffect(() => setConflicts([]), [editing?.day, editing?.startTime, editing?.endTime]);

  const classOptions = (classesQuery.data?.items ?? []).map((c: ClassSection) => ({
    value: c.id,
    label: `${c.gradeLevel} ${c.section}`,
  }));
  const subjectOptions = (subjectsQuery.data?.items ?? [])
    .filter((s: Subject) => !editing?.classSectionId || !s.classSectionId || s.classSectionId === editing.classSectionId)
    .map((s: Subject) => ({ value: s.id, label: `${s.code} — ${s.name}` }));
  const teacherOptions = (teachersQuery.data?.items ?? []).map((t: Teacher) => ({
    value: t.userId,
    label: `${t.firstName} ${t.lastName}`,
  }));

  const subjectById = new Map((subjectsQuery.data?.items ?? []).map((s: Subject) => [s.id, s]));

  function openCreate(day: Weekday) {
    setEditing({
      classSectionId: classSectionId || classOptions[0]?.value || "",
      subjectId: "",
      teacherId: "",
      day,
      startTime: "09:00",
      endTime: "10:00",
    });
    setConflicts([]);
  }

  function openEdit(slot: TimetableSlotView) {
    setEditing({
      id: slot.id,
      classSectionId: slot.classSectionId,
      subjectId: slot.subjectId,
      teacherId: slot.teacherId,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    setConflicts([]);
  }

  const liveConflicts = check.data?.conflicts.map((c) => c.message) ?? [];
  const allConflicts = [...new Set([...conflicts, ...liveConflicts])];

  /**
   * The pre-flight check only runs once a class, teacher and a valid time range
   * are chosen. Before that we must say so explicitly — silently showing nothing
   * would let an admin assume "no conflict found" when nothing was checked.
   */
  const checkReady =
    !!editing?.classSectionId &&
    !!editing?.teacherId &&
    !!editing?.startTime &&
    !!editing?.endTime &&
    editing.startTime < editing.endTime;
  const missingTeacher = checkReady === false && !!editing && !editing.teacherId;

  return (
    <AppLayout title="Timetable">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Timetable</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Weekly schedule per class. A slot is rejected if it would double-book the teacher or
              the class — back-to-back lessons are allowed.
            </p>
          </div>
          {isAdmin && classSectionId && (
            <Button onClick={() => openCreate("monday")}>
              <Plus className="size-4" /> Add slot
            </Button>
          )}
        </div>

        {isAdmin && (
          <Card>
            <Field label="Class">
              <Select
                value={classSectionId}
                onChange={setClassSectionId}
                options={classOptions}
                placeholder="Select a class to view or edit its timetable"
              />
            </Field>
          </Card>
        )}

        {slots.isLoading && (
          <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
            <Spinner /> Loading timetable…
          </div>
        )}

        {slots.isError && (
          <Card>
            <p className="text-sm text-destructive">
              {slots.error ? errorMessage(slots.error) : "Could not load the timetable."}
            </p>
          </Card>
        )}

        {slots.data && slots.data.length === 0 && (
          <Card>
            <div className="py-12 text-center">
              <CalendarClock className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="font-medium text-foreground">No slots scheduled</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAdmin
                  ? "Pick a class and add the first slot."
                  : "No timetable has been published yet."}
              </p>
              {isAdmin && classSectionId && (
                <Button className="mt-5" onClick={() => openCreate("monday")}>
                  <Plus className="size-4" /> Add slot
                </Button>
              )}
            </div>
          </Card>
        )}

        {slots.data && slots.data.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-5">
            {DAYS.map((day) => (
              <div key={day} className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span className="font-display text-sm font-medium text-foreground">
                    {DAY_LABEL[day]}
                  </span>
                  <span className="text-xs text-muted-foreground">{byDay[day].length}</span>
                </div>
                <div className="space-y-2 p-2.5">
                  {byDay[day].length === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">No lessons</p>
                  )}
                  {byDay[day].map((s) => (
                    <div
                      key={s.id}
                      className="group rounded-lg border border-border bg-secondary/40 p-2.5 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[11px] text-primary">
                          {s.startTime}–{s.endTime}
                        </span>
                        {isAdmin && (
                          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => openEdit(s)}
                              aria-label="Edit slot"
                              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => setConfirm(s)}
                              aria-label="Delete slot"
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">{s.subjectCode}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.teacherName}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slot editor */}
      <Modal
        open={!!editing}
        onClose={() => {
          setEditing(null);
          setConflicts([]);
        }}
        title={editing?.id ? "Edit slot" : "Add timetable slot"}
        description="Conflicts are checked as you change the time — a clashing slot cannot be saved."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setConflicts([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => editing && save.mutate(editing)}
              isLoading={save.isPending}
              disabled={
                !editing?.subjectId ||
                !editing?.teacherId ||
                !editing?.classSectionId ||
                editing.startTime >= editing.endTime ||
                allConflicts.length > 0
              }
            >
              {editing?.id ? "Save changes" : "Add slot"}
            </Button>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Class">
              <Select
                value={editing.classSectionId}
                onChange={(v) => setEditing({ ...editing, classSectionId: v })}
                options={classOptions}
                placeholder="Select a class"
              />
            </Field>

            <Field label="Subject">
              <Select
                value={editing.subjectId}
                onChange={(v) => {
                  // Pre-fill the teacher from the subject's assigned teacher.
                  const subj = subjectById.get(v) as Subject | undefined;
                  setEditing({
                    ...editing,
                    subjectId: v,
                    teacherId: subj?.teacherId ?? editing.teacherId,
                  });
                }}
                options={subjectOptions}
                placeholder="Select a subject"
              />
            </Field>

            <Field label="Teacher">
              <Select
                value={editing.teacherId}
                onChange={(v) => setEditing({ ...editing, teacherId: v })}
                options={teacherOptions}
                placeholder="Select a teacher"
              />
            </Field>

            <Field label="Day">
              <Select
                value={editing.day}
                onChange={(v) => setEditing({ ...editing, day: v as Weekday })}
                options={DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] }))}
                placeholder="Select a day"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start time">
                <Select
                  value={editing.startTime}
                  onChange={(v) => setEditing({ ...editing, startTime: v })}
                  options={TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                  placeholder="Start"
                />
              </Field>
              <Field label="End time">
                <Select
                  value={editing.endTime}
                  onChange={(v) => setEditing({ ...editing, endTime: v })}
                  options={TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                  placeholder="End"
                />
              </Field>
            </div>

            {/* Live feedback — always says something, never silently nothing. */}
            {editing.startTime >= editing.endTime && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                End time must be after the start time.
              </div>
            )}

            {editing.startTime < editing.endTime && !checkReady && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                <AlertTriangle className="size-4 shrink-0" />
                {missingTeacher
                  ? "Pick a teacher to run the conflict check."
                  : "Choose a class, teacher and time to run the conflict check."}
              </div>
            )}

            {checkReady && check.isFetching && allConflicts.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                <Spinner /> Checking for conflicts…
              </div>
            )}

            {checkReady &&
              !check.isFetching &&
              allConflicts.length === 0 &&
              check.isSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3.5 py-2.5 text-sm text-success">
                  <CheckCircle2 className="size-4 shrink-0" />
                  No conflicts — this slot can be saved.
                </div>
              )}

            {allConflicts.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  {allConflicts.length} conflict{allConflicts.length === 1 ? "" : "s"} detected
                </p>
                <ul className="mt-2 space-y-1 pl-6 text-xs text-destructive/90">
                  {allConflicts.map((c) => (
                    <li key={c} className="list-disc">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              <Badge tone="primary">Tip</Badge> Ending a lesson exactly when another begins is
              allowed — only overlapping times clash.
            </p>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.id)}
        busy={remove.isPending}
        title="Remove slot"
        confirmLabel="Remove"
        message={
          <>
            Remove <strong className="text-foreground">{confirm?.subjectCode}</strong> on{" "}
            {confirm ? DAY_LABEL[confirm.day] : ""} at {confirm?.startTime}?
          </>
        }
      />
    </AppLayout>
  );
}
