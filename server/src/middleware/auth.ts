import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken, isExpiredTokenError } from "../utils/tokens.js";
import { catchAsync } from "../utils/catchAsync.js";
import { User } from "../models/User.js";
import type { Role } from "@sms/shared";

/** Shape attached to req by `protect`. Declared globally so controllers get types. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
      };
    }
  }
}

/**
 * Requires a valid Bearer access token.
 * Verifies the token AND that the user still exists and is active — a token for
 * a deleted or deactivated account must not work.
 */
export const protect: RequestHandler = catchAsync(async (req, _res, next) => {
  const header = req.get("authorization");
  let token: string | undefined;

  if (header?.startsWith("Bearer ")) token = header.slice(7).trim();
  if (!token) throw ApiError.unauthorized("You must be signed in to do that");

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (isExpiredTokenError(err)) {
      // Distinct message so the client knows to attempt a refresh.
      throw new ApiError(401, "Access token expired", { code: "TOKEN_EXPIRED" });
    }
    throw ApiError.unauthorized("Invalid access token");
  }

  const user = await User.findById(payload.sub).select("email role isActive");
  if (!user) throw ApiError.unauthorized("The account for this session no longer exists");
  if (!user.isActive) throw ApiError.forbidden("This account has been deactivated");

  req.user = { id: String(user._id), email: user.email, role: user.role };
  next();
});

/** Restricts a route to one or more roles. Use AFTER `protect`. */
export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action requires one of: ${allowed.join(", ")}`));
    }
    next();
  };

/** Convenience guards. */
export const adminOnly = requireRole("admin");
export const staffOnly = requireRole("admin", "teacher");

/**
 * Allows a request when the acting user IS the owner, or holds a privileged role.
 * This is the check that stops a student reading another student's records.
 */
export function requireSelfOrRole(
  getOwnerId: (req: Request) => string | undefined,
  ...privilegedRoles: Role[]
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    const ownerId = getOwnerId(req);
    if (req.user.id === ownerId || privilegedRoles.includes(req.user.role)) return next();
    next(ApiError.forbidden("You can only access your own records"));
  };
}
