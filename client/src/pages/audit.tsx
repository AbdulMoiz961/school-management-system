import { useState } from "react";
import { History, Plus, Pencil, Trash2 } from "lucide-react";
import type { AuditLogEntry } from "@sms/shared";
import { AppLayout } from "@/components/app-layout";
import { Badge, Button } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { Modal } from "@/components/form";
import { auditApi } from "@/api/resources";
import { useListState, usePaginatedQuery } from "@/lib/crud";
import { formatDate } from "@/lib/cn";

const ACTION_META = {
  create: { tone: "success" as const, icon: Plus, label: "created" },
  update: { tone: "primary" as const, icon: Pencil, label: "updated" },
  delete: { tone: "danger" as const, icon: Trash2, label: "deleted" },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    // Dates arrive as ISO strings; ObjectIds as hex strings.
    const s = String(v);
    return s.length > 40 ? `${s.slice(0, 37)}…` : s;
  }
  return String(v);
}

export default function AuditPage() {
  const list = useListState({ sortBy: "at", sortDir: "desc", limit: 25 });
  const [filter, setFilter] = useState<{ resource?: string; action?: string }>({});
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const query = usePaginatedQuery<AuditLogEntry>(["audit", list.query, filter], () =>
    auditApi.list({ ...list.query, ...filter }),
  );

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "at",
      header: "When",
      sortable: true,
      render: (e) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {new Date(e.at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      sortable: true,
      render: (e) => {
        const meta = ACTION_META[e.action];
        const Icon = meta.icon;
        return (
          <Badge tone={meta.tone}>
            <Icon className="mr-1 size-3" />
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: "resource",
      header: "Record",
      sortable: true,
      render: (e) => (
        <div>
          <span className="font-medium text-foreground">{e.resource}</span>
          {e.resourceLabel && (
            <p className="text-xs text-muted-foreground">{e.resourceLabel}</p>
          )}
        </div>
      ),
    },
    {
      key: "actorEmail",
      header: "By",
      sortable: true,
      hideBelow: "sm",
      render: (e) => <span className="text-muted-foreground">{e.actorEmail}</span>,
    },
    {
      key: "changes",
      header: "Fields",
      hideBelow: "md",
      render: (e) =>
        e.changes ? (
          <span className="text-xs text-muted-foreground">
            {Object.keys(e.changes).length} field{Object.keys(e.changes).length === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "view",
      header: "",
      className: "text-right",
      render: (e) => (
        <Button size="sm" variant="ghost" onClick={() => setDetail(e)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <AppLayout title="Audit Log">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Audit log</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every create, update and delete, with the actor and a field-level diff. Entries are
            immutable.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["", "All"],
              ["Student", "Students"],
              ["Teacher", "Teachers"],
              ["ClassSection", "Classes"],
              ["Subject", "Subjects"],
              ["Term", "Terms"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              onClick={() => setFilter((f) => ({ ...f, resource: value || undefined }))}
              className={
                (filter.resource ?? "") === value
                  ? "rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs text-primary"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          rows={query.items}
          rowKey={(e) => e.id}
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
          searchPlaceholder="Search by user or record…"
          emptyTitle="No activity yet"
          emptyDescription="Actions will appear here as records are created and changed."
        />
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Change details"
        description={detail ? `${detail.resource} · ${detail.resourceLabel ?? detail.resourceId}` : ""}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  Action
                </p>
                <p className="mt-1 text-sm text-foreground capitalize">{detail.action}</p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  Performed by
                </p>
                <p className="mt-1 text-sm break-all text-foreground">{detail.actorEmail}</p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  When
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {formatDate(detail.at)} ·{" "}
                  {new Date(detail.at).toLocaleTimeString("en-GB")}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Changes
              </p>
              {detail.changes && Object.keys(detail.changes).length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          Field
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          From
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          To
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(detail.changes).map(([field, diff]) => (
                        <tr key={field} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-foreground">{field}</td>
                          <td className="px-3 py-2 text-xs text-destructive/90">
                            {formatValue(diff.from)}
                          </td>
                          <td className="px-3 py-2 text-xs text-success">
                            {formatValue(diff.to)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  <History className="mx-auto mb-2 size-4" />
                  {detail.action === "create"
                    ? "Record was created."
                    : "Record was deleted."}
                </p>
              )}
            </div>

            <div className="rounded-lg bg-secondary/40 px-3 py-2">
              <p className="font-mono text-[11px] break-all text-muted-foreground">
                {detail.resourceId}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
