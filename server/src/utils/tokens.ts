import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { Role } from "@sms/shared";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Must match User.refreshTokenVersion or the token is rejected. */
  ver: number;
}

/** Short-lived token for API authorisation (sent as a Bearer header). */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Long-lived token used only to mint new access tokens (httpOnly cookie). */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** True when the token failed because it expired (vs. being invalid/forged). */
export function isExpiredTokenError(err: unknown): boolean {
  return err instanceof jwt.TokenExpiredError;
}

/** Cookie options for the refresh token. */
export const REFRESH_COOKIE_NAME = "sms_refresh";
export const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matching JWT_REFRESH_EXPIRES_IN
};
