import type { RequestHandler } from "express";
import { ApiError } from "../utils/ApiError.js";

/** Security headers. CSP is set explicitly rather than left to the default. */
export const securityHeaders = (): RequestHandler => {
  // helmet is applied in app.ts via app.use(helmet(...)); this module exists as
  // the single place to extend security config as the app grows.
  return (_req, _res, next) => next();
};

/** Rejects state-changing requests whose Origin isn't the known client. */
export const csrfOriginCheck = (allowedOrigins: string[]): RequestHandler => {
  return (req, _res, next) => {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

    const origin = req.get("origin");
    // Same-origin/server-to-server requests (curl, supertest) omit Origin — allow them,
    // since a browser can't be tricked into omitting it.
    if (!origin) return next();

    if (!allowedOrigins.includes(origin)) {
      return next(ApiError.forbidden("Request origin not allowed"));
    }
    next();
  };
};
