import type { FilterQuery, Model, SortOrder } from "mongoose";
import type { ListQuery, Pagination } from "@sms/shared";

export interface ListResult<T> {
  items: T[];
  pagination: Pagination;
}

/** Clamp a requested page size so a client can't ask for 1,000,000 records. */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

/**
 * Builds pagination + sorting options from a validated ListQuery.
 * `allowedSortFields` is an allow-list — never interpolate raw client input into
 * a sort, or a user can sort by an unindexed/private field.
 */
export function buildListOptions(
  query: ListQuery,
  allowedSortFields: readonly string[],
  defaultSort = "-createdAt",
): { skip: number; limit: number; sort: Record<string, SortOrder>; page: number } {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)));
  const skip = (page - 1) * limit;

  let sort: Record<string, SortOrder>;
  if (query.sortBy && allowedSortFields.includes(query.sortBy)) {
    sort = { [query.sortBy]: query.sortDir === "desc" ? -1 : 1 };
  } else {
    const desc = defaultSort.startsWith("-");
    const field = desc ? defaultSort.slice(1) : defaultSort;
    sort = { [field]: desc ? -1 : 1 };
  }

  return { skip, limit, sort, page };
}

/**
 * Runs a paginated find + count against a model, returning the documents so the
 * caller can map them to their public shape.
 *
 * Typed loosely on purpose: Mongoose's Model/Document generics don't survive a
 * generic wrapper cleanly. Callers pass a mapper, which keeps the public types
 * precise where it matters.
 */
export async function paginateModel<TDoc = unknown>(
  model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  filter: FilterQuery<unknown>,
  opts: { skip: number; limit: number; sort: Record<string, SortOrder>; page: number },
  populate?: string | string[],
): Promise<{ docs: TDoc[]; pagination: Pagination }> {
  let q = model.find(filter).sort(opts.sort).skip(opts.skip).limit(opts.limit);
  if (populate) q = q.populate(populate);

  const [docs, total] = await Promise.all([q.exec(), model.countDocuments(filter).exec()]);

  return {
    docs: docs as TDoc[],
    pagination: {
      page: opts.page,
      limit: opts.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / opts.limit)),
    },
  };
}

/** Escapes user input before using it inside a RegExp (prevents ReDoS/injection). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive "contains" filter across several fields. */
export function searchFilter(search: string | undefined, fields: string[]): FilterQuery<unknown> {
  const term = search?.trim();
  if (!term) return {};
  const rx = new RegExp(escapeRegex(term), "i");
  return { $or: fields.map((f) => ({ [f]: rx })) } as FilterQuery<unknown>;
}
