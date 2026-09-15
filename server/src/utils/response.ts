import type { Response } from "express";
import type { ApiSuccess, Paginated, Pagination } from "@sms/shared";

/** Every successful response goes through one of these, so the shape is uniform. */
export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): Response => {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(statusCode).json(body);
};

export const sendPaginated = <T>(
  res: Response,
  items: T[],
  pagination: Pagination,
  statusCode = 200,
): Response => {
  const body: ApiSuccess<Paginated<T>> = {
    success: true,
    data: { items, pagination },
  };
  return res.status(statusCode).json(body);
};

/** Builds a pagination envelope from raw inputs. */
export const buildPagination = (page: number, limit: number, total: number): Pagination => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
