import { useState } from "react";
import { Bell, CheckCheck, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import type { Announcement, ClassSection, Role } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button, Card, Input, Spinner } from "@/components/ui";
import { ConfirmDialog, Field, Modal, Select, Textarea } from "@/components/form";
import { announcementsApi } from "@/api/phase4";
import { classesApi } from "@/api/resources";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useListState, usePaginatedQuery } from "@/lib/crud";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrators",
  teacher: "Teachers",
  student: "Students",
};

interface Draft {
  id?: string;
  title: string;
  body: string;
  audienceRoles: Role[];
  classSectionId: string;
  requiresAcknowledgement: boolean;
}

const EMPTY: Draft = {
  title: "",
  body: "",
  audienceRoles: [],
  classSectionId: "",
  requiresAcknowledgement: false,
};

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "teacher";
  const qc = useQueryClient();

  const listState = useListState({ sortBy: "createdAt", sortDir: "desc" });
  const list = usePaginatedQuery<Announcement>(
    ["announcements", listState.query],
    () => announcementsApi.list(listState.query),
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<Announcement | null>(null);

  const classesQuery = useQuery({
    queryKey: ["classes-all"],
    queryFn: () => classesApi.list({ limit: 100 }),
    enabled: user?.role === "admin",
  });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const payload = {
        title: d.title,
        body: d.body,
        audienceRoles: d.audienceRoles,
        ...(d.classSectionId ? { classSectionId: d.classSectionId } : {}),
        requiresAcknowledgement: d.requiresAcknowledgement,
      };
      return d.id ? announcementsApi.update(d.id, payload) : announcementsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success(draft?.id ? "Announcement updated" : "Announcement published");
      setDraft(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Announcement removed");
      setConfirm(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => announcementsApi.acknowledge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast.success("Thanks — marked as read");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const classOptions = (classesQuery.data?.items ?? []).map((c: ClassSection) => ({
    value: c.id,
    label: `${c.gradeLevel} ${c.section}`,
  }));

  function audienceLabel(a: Announcement): string {
    if (a.audienceRoles.length === 0) return "Everyone";
    return a.audienceRoles.map((r) => ROLE_LABEL[r]).join(", ");
  }

  return (
    <AppLayout title="Announcements">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Announcements</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isStaff
                ? "Publish notices to everyone, a role, or a single class."
                : "Notices that apply to you."}
            </p>
          </div>
          {isStaff && (
            <Button onClick={() => setDraft({ ...EMPTY })}>
              <Plus className="size-4" /> New announcement
            </Button>
          )}
        </div>

        {isStaff && (
          <Input
            placeholder="Search announcements…"
            value={listState.query.search ?? ""}
            onChange={(e) => listState.setSearch(e.target.value)}
          />
        )}

        {list.isLoading && (
          <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
            <Spinner /> Loading announcements…
          </div>
        )}

        {list.isError && (
          <Card>
            <p className="text-sm text-destructive">
              {list.error ? errorMessage(list.error) : "Could not load announcements."}
            </p>
          </Card>
        )}

        {list.items.length === 0 && !list.isLoading && (
          <Card>
            <div className="py-14 text-center">
              <Megaphone className="mx-auto mb-3 size-5 text-muted-foreground" />
              <p className="font-medium text-foreground">Nothing posted yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isStaff ? "Publish the first announcement." : "Check back later."}
              </p>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {list.items.map((a) => (
            <Card key={a.id} className="group">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Bell className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-medium text-foreground">
                      {a.title}
                    </h3>
                    <Badge tone={a.audienceRoles.length === 0 ? "primary" : "default"}>
                      {audienceLabel(a)}
                    </Badge>
                    {a.classSectionName && <Badge tone="default">{a.classSectionName}</Badge>}
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                    {a.body}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {a.authorName}
                    {a.requiresAcknowledgement && (
                      <>
                        {" · "}
                        <span className="text-primary">
                          {a.acknowledgementCount} acknowledged
                        </span>
                      </>
                    )}
                    {" · "}
                    {new Date(a.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {isStaff ? (
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() =>
                          setDraft({
                            id: a.id,
                            title: a.title,
                            body: a.body,
                            audienceRoles: a.audienceRoles,
                            classSectionId: a.classSectionId ?? "",
                            requiresAcknowledgement: a.requiresAcknowledgement,
                          })
                        }
                        aria-label="Edit announcement"
                        className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirm(a)}
                        aria-label="Delete announcement"
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    a.requiresAcknowledgement && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledge.mutate(a.id)}
                        isLoading={acknowledge.isPending}
                      >
                        <CheckCheck className="size-3.5" /> Mark as read
                      </Button>
                    )
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {list.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-muted-foreground">
              Page {list.pagination.page} of {list.pagination.totalPages} ·{" "}
              {list.pagination.total} notices
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={list.pagination.page <= 1}
                onClick={() => listState.setPage(list.pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={list.pagination.page >= list.pagination.totalPages}
                onClick={() => listState.setPage(list.pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit announcement" : "New announcement"}
        description="Leave audience empty to notify everyone."
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => draft && save.mutate(draft)}
              isLoading={save.isPending}
              disabled={!draft?.title.trim() || !draft?.body.trim()}
            >
              {draft?.id ? "Save changes" : "Publish"}
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Mid-term exams begin Monday"
                maxLength={140}
              />
            </Field>

            <Field label="Message">
              <Textarea
                rows={5}
                value={draft.body}
                onChange={(v) => setDraft({ ...draft, body: v })}
                placeholder="Write the announcement…"
              />
            </Field>

            <Field label="Audience" hint="Select none to notify every role.">
              <div className="flex flex-wrap gap-2">
                {(["admin", "teacher", "student"] as Role[]).map((r) => {
                  const on = draft.audienceRoles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          audienceRoles: on
                            ? draft.audienceRoles.filter((x) => x !== r)
                            : [...draft.audienceRoles, r],
                        })
                      }
                      className={
                        on
                          ? "rounded-full border border-primary/50 bg-primary/20 px-3.5 py-1.5 text-xs text-primary"
                          : "rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary/60"
                      }
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  );
                })}
              </div>
            </Field>

            {user?.role === "admin" && (
              <Field label="Class" hint="Optional — limits the notice to one class.">
                <Select
                  value={draft.classSectionId}
                  onChange={(v) => setDraft({ ...draft, classSectionId: v })}
                  options={classOptions}
                  placeholder="All classes"
                />
              </Field>
            )}

            <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={draft.requiresAcknowledgement}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDraft({ ...draft, requiresAcknowledgement: e.target.checked })
                }
                className="size-4 accent-[var(--primary)]"
              />
              Require students to acknowledge this
            </label>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.id)}
        busy={remove.isPending}
        title="Remove announcement"
        confirmLabel="Remove"
        message={
          <>
            Remove <strong className="text-foreground">{confirm?.title}</strong>? It will no longer
            be visible to anyone.
          </>
        }
      />
    </AppLayout>
  );
}
