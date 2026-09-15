import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so rejected promises reach Express's error
 * middleware. Without this, `throw` inside an async handler hangs the request.
 *
 *   router.get("/", catchAsync(async (req, res) => { ... }));
 */
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
