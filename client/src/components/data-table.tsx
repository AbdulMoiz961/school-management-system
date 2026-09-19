import { useEffect, useState, type ReactNode } from "react";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input, Spinner } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  /** Renders the cell. Return a node, or a string for plain text. */
  render: (row: T) => ReactNode;
  /** Set to make the column sortable. Must match a server-side allow-listed field. */
  sortable?: boolean;
  className?: string;
  /** Hide on narrow screens to keep the table readable. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable key per row. */
  rowKey: (row: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  /** Server-side pagination state. */
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (field: string, dir: "asc" | "desc") => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Toolbar right side — usually a "Create" button. */
  actions?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Optional row click (e.g. open a detail view). */
  onRowClick?: (row: T) => void;
}

const hideClass = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  isError,
  errorMessage,
  page,
  totalPages,
  total,
  onPageChange,
  sortBy,
  sortDir,
  onSortChange,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  actions,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowClick,
}: DataTableProps<T>) {
  // Local mirror of the search box so typing stays responsive; the parent
  // debounces the actual request.
  const [term, setTerm] = useState(search ?? "");
  useEffect(() => setTerm(search ?? ""), [search]);

  const handleSort = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return;
    const nextDir = sortBy === col.key && sortDir === "asc" ? "desc" : "asc";
    onSortChange(col.key, nextDir);
  };

  const showEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <div className="panel overflow-hidden">
      {/* Toolbar */}
      {(onSearchChange || actions) && (
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          {onSearchChange ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  onSearchChange(e.target.value);
                }}
                placeholder={searchPlaceholder}
                className="pl-9"
                aria-label="Search"
              />
            </div>
          ) : (
            <div />
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
          <Spinner className="size-5" /> Loading…
        </div>
      ) : isError ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-destructive">{errorMessage ?? "Failed to load data"}</p>
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="font-medium text-foreground">{emptyTitle}</p>
          {emptyDescription && (
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
          )}
          {emptyAction && <div className="mt-5">{emptyAction}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase",
                      col.sortable && onSortChange && "cursor-pointer select-none hover:text-foreground",
                      col.hideBelow && hideClass[col.hideBelow],
                      col.className,
                    )}
                    onClick={() => handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && (
                        <ArrowUpDown
                          className={cn(
                            "size-3",
                            sortBy === col.key ? "text-primary" : "text-muted-foreground/50",
                          )}
                        />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    onRowClick && "cursor-pointer transition-colors hover:bg-secondary/40",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 align-middle text-foreground",
                        col.hideBelow && hideClass[col.hideBelow],
                        col.className,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && rows.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? "No results"
              : `Page ${page} of ${totalPages} · ${total} record${total === 1 ? "" : "s"}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs text-foreground transition-colors hover:bg-secondary/60 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" /> Prev
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs text-foreground transition-colors hover:bg-secondary/60 disabled:pointer-events-none disabled:opacity-40"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
