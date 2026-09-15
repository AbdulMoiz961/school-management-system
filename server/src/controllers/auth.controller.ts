import type { Response } from "express";
import type { Request } from "express";
import * as authService from "../services/auth.service.js";
import { catchAsync } from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/response.js";
import { ApiError } from "../utils/ApiError.js";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "../utils/tokens.js";

/** Sets the refresh token as an httpOnly cookie so JS can't read it (XSS-safe). */
function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions, maxAge: undefined });
}

export const register = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken, ...result } = await authService.register(req.body);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, result, 201);
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken, ...result } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, result);
});

/** Reads the refresh token from the cookie (preferred) or the request body. */
export const refresh = catchAsync(async (req: Request, res: Response) => {
  const token: string | undefined =
    req.cookies?.[REFRESH_COOKIE_NAME] ??
    (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);

  const { refreshToken, ...result } = await authService.refresh(token);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, result);
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await authService.logout(req.user.id);
  clearRefreshCookie(res);
  sendSuccess(res, { message: "Signed out" });
});

export const me = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, user);
});

export const updateMe = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.updateProfile(req.user.id, req.body);
  sendSuccess(res, user);
});

export const changePassword = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { refreshToken, accessToken } = await authService.changePassword(req.user.id, req.body);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { accessToken });
});
