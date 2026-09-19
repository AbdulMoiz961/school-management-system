import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ListQuery, Paginated } from "@sms/shared";
import { ApiClientError } from "@/api/errors";

/**
 * Shared list state for every CRUD page: page, search, sort.
 * Search is debounced so typing doesn't fire a request per keystroke.
 */
export function useListState(initial: ListQuery = {}) {
  const [page, setPage] = useState(initial.page ?? 1);
  const [search, setSearchRaw] = useState(initial.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sortBy, setSortBy] = useState(initial.sortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | undefined>(initial.sortDir);
  const [includeInactive, setIncludeInactive] = useState(initial.includeInactive ?? false);
  const [limit, setLimit] = useState(initial.limit ?? 20);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change resets to page 1 — otherwise you can land on an empty page.
  const setSearch = useCallback((value: string) => {
    setSearchRaw(value);
    setPage(1);
  }, []);

  const onSortChange = useCallback((field: string, dir: "asc" | "desc") => {
    setSortBy(field);
    setSortDir(dir);
    setPage(1);
  }, []);

  const query: ListQuery = useMemo(
    () => ({
      page,
      limit,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(sortDir ? { sortDir } : {}),
      ...(includeInactive ? { includeInactive: true } : {}),
    }),
    [page, limit, debouncedSearch, sortBy, sortDir, includeInactive],
  );

  return {
    page,
    setPage,
    search,
    setSearch,
    sortBy,
    sortDir,
    onSortChange,
    includeInactive,
    setIncludeInactive,
    limit,
    setLimit,
    query,
  };
}

/**
 * Wraps a paginated list fetch in react-query with `keepPreviousData` behaviour,
 * so the table doesn't flash empty while the next page loads.
 */
export function usePaginatedQuery<T>(
  key: readonly unknown[],
  fetcher: () => Promise<Paginated<T>>,
) {
  const result = useQuery({
    queryKey: key,
    queryFn: fetcher,
    placeholderData: (prev) => prev,
  });

  return {
    items: result.data?.items ?? [],
    pagination: result.data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
}

/** Extracts a readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    // Prefer a field-level message — it's the most actionable.
    if (err.errors) {
      const first = Object.values(err.errors)[0];
      if (first?.[0]) return first[0];
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

/**
 * Standard create/update/delete mutations.
 *
 * Every mutation invalidates the entity's queries and surfaces a toast, so the
 * pages don't each reimplement success/error handling.
 */
export function useCrudMutations<T>(options: {
  entity: string;
  invalidateKeys: readonly unknown[][];
  create?: (input: never) => Promise<T>;
  update?: (id: string, input: never) => Promise<T>;
  remove?: (id: string) => Promise<unknown>;
  onSuccessMessage?: { create?: string; update?: string; remove?: string };
}) {
  const qc = useQueryClient();
  const { entity, invalidateKeys, onSuccessMessage = {} } = options;

  const invalidate = () => {
    for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
  };

  const createMutation = useMutation({
    mutationFn: (input: never) => options.create!(input),
    onSuccess: () => {
      invalidate();
      toast.success(onSuccessMessage.create ?? `${entity} created`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: never }) => options.update!(id, input),
    onSuccess: () => {
      invalidate();
      toast.success(onSuccessMessage.update ?? `${entity} updated`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => options.remove!(id),
    onSuccess: () => {
      invalidate();
      toast.success(onSuccessMessage.remove ?? `${entity} removed`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return { createMutation, updateMutation, removeMutation };
}
