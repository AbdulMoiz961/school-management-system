import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { env, isProd } from "../config/env.js";
import type { ApiErrorBody } from "@sms/shared";

/** 404 for anything that fell through the routers. */
export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    code: "NOT_FOUND",
  };
  res.status(404).json(body);
};

/** Translates known error shapes into our uniform envelope. */
function normalise(err: unknown): { status: number; body: ApiErrorBody } {
  // 1. Our own operational errors — safe to expose.
  if (err instanceof ApiError) {
    return {
      status: err.statusCode,
      body: {
        success: false,
        message: err.message,
        ...(err.errors ? { errors: err.errors } : {}),
        ...(err.code ? { code: err.code } : {}),
      },
    };
  }

  // 2. Zod validation errors that escaped a validator.
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "(root)";
      (errors[key] ??= []).push(issue.message);
    }
    return {
      status: 400,
      body: { success: false, message: "Validation failed", errors, code: "VALIDATION_ERROR" },
    };
  }

  // 3. Mongoose: bad ObjectId.
  if (err instanceof Error && err.name === "CastError") {
    return {
      status: 400,
      body: { success: false, message: "Invalid identifier format", code: "INVALID_ID" },
    };
  }

  // 4. Mongoose: unique index violation.
  if (err instanceof Error && err.name === "MongoServerError" && "code" in err && err.code === 11000) {
    const dup = (err as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    const field = Object.keys(dup)[0] ?? "field";
    return {
      status: 409,
      body: {
        success: false,
        message: `A record with that ${field} already exists`,
        errors: { [field]: ["Must be unique"] },
        code: "DUPLICATE_KEY",
      },
    };
  }

  // 5. Mongoose: schema validation.
  if (err instanceof Error && err.name === "ValidationError") {
    const errors: Record<string, string[]> = {};
    const ve = err as Error & { errors?: Record<string, { message: string }> };
    for (const [key, val] of Object.entries(ve.errors ?? {})) errors[key] = [val.message];
    return {
      status: 400,
      body: { success: false, message: "Validation failed", errors, code: "VALIDATION_ERROR" },
    };
  }

  // 6. JSON body parse failure from express.json().
  if (err instanceof SyntaxError && "body" in err) {
    return {
      status: 400,
      body: { success: false, message: "Malformed JSON in request body", code: "BAD_JSON" },
    };
  }

  // 7. Unknown — a programmer error. Never leak internals in production.
  const message =
    !isProd && err instanceof Error ? err.message : "Something went wrong on our end";
  return { status: 500, body: { success: false, message, code: "INTERNAL" } };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, body } = normalise(err);

  if (status >= 500) {
    // Log the full stack for genuine failures.
    console.error("✖ Unhandled error:", err);
  } else if (!isProd) {
    console.warn(`✖ ${status} ${body.message}`);
  }

  if (isProd && status >= 500) {
    // In production, attach the real message to the log only (already done above)
    // and return a generic body. Kept explicit for clarity.
    res.status(status).json({ ...body, message: "Something went wrong on our end" });
    return;
  }

  res.status(status).json(body);
};

/** Guards against unhandled promise rejections crashing the process silently. */
export function registerProcessHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    console.error("✖ Unhandled promise rejection:", reason);
    if (env.NODE_ENV === "production") process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    console.error("✖ Uncaught exception:", err);
    process.exit(1);
  });
}
