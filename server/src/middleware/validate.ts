import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../utils/ApiError.js";

type Source = "body" | "query" | "params";

/**
 * Validates req[source] against a zod schema and REPLACES it with the parsed
 * result, so downstream handlers get coerced, stripped, type-safe data.
 *
 * Uses safeParse rather than parse: a ZodError thrown in middleware would work,
 * but returning our own ApiError keeps the response envelope consistent.
 */
export const validate =
  (schema: ZodTypeAny, source: Source = "body"): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "(root)";
        (errors[key] ??= []).push(issue.message);
      }
      next(ApiError.badRequest("Validation failed", errors));
      return;
    }

    // req.query / req.params are getter-only in some Express versions — assign safely.
    if (source === "query") {
      Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data as never;
    }

    next();
  };
