import { User, type UserDocument } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  isExpiredTokenError,
} from "../utils/tokens.js";
import type { AuthResult, UserSummary } from "@sms/shared";
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  UpdateProfileInput,
} from "../validators/auth.validator.js";

/** Maps a Mongoose user document to the public shape shared with the client. */
export function toUserSummary(user: UserDocument): UserSummary {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

function issueTokens(user: UserDocument) {
  const accessToken = signAccessToken({
    sub: String(user._id),
    role: user.role,
    email: user.email,
  });
  const refreshToken = signRefreshToken({
    sub: String(user._id),
    ver: user.refreshTokenVersion,
  });
  return { accessToken, refreshToken };
}

/**
 * Self-registration.
 *
 * NOTE: public signup is intentionally restricted to `student`. Privileged roles
 * (admin/teacher) are created by an admin via the user-management service —
 * otherwise anyone could POST role:"admin" and escalate.
 */
export async function register(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) throw ApiError.conflict("An account with that email already exists");

  const user = await User.create({
    email: input.email,
    password: input.password,
    firstName: input.firstName,
    lastName: input.lastName,
    role: "student", // forced, see note above
  });

  const tokens = issueTokens(user);
  const result: AuthResult = { user: toUserSummary(user), accessToken: tokens.accessToken };
  return { ...result, refreshToken: tokens.refreshToken };
}

export async function login(input: LoginInput) {
  // password has select:false on the schema, so ask for it explicitly.
  const user = await User.findOne({ email: input.email }).select("+password");
  // Same message for "no such user" and "wrong password" — avoids leaking
  // which emails are registered.
  if (!user) throw ApiError.unauthorized("Invalid email or password");

  const ok = await user.comparePassword(input.password);
  if (!ok) throw ApiError.unauthorized("Invalid email or password");

  if (!user.isActive) throw ApiError.forbidden("This account has been deactivated");

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const tokens = issueTokens(user);
  const result: AuthResult = { user: toUserSummary(user), accessToken: tokens.accessToken };
  return { ...result, refreshToken: tokens.refreshToken };
}

/** Exchanges a valid refresh token for a new access token (rotation, no reuse). */
export async function refresh(token: string | undefined) {
  if (!token) throw ApiError.unauthorized("No refresh token provided");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    if (isExpiredTokenError(err)) throw ApiError.unauthorized("Session expired, please sign in again");
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized("Account no longer active");

  // Reject tokens minted before the last logout / password change.
  if (user.refreshTokenVersion !== payload.ver) {
    throw ApiError.unauthorized("Session is no longer valid, please sign in again");
  }

  const tokens = issueTokens(user);
  const result: AuthResult = { user: toUserSummary(user), accessToken: tokens.accessToken };
  return { ...result, refreshToken: tokens.refreshToken };
}

/** Invalidates all outstanding refresh tokens for the user. */
export async function logout(userId: string) {
  await User.findByIdAndUpdate(userId, { $inc: { refreshTokenVersion: 1 } });
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw ApiError.notFound("User not found");

  const ok = await user.comparePassword(input.currentPassword);
  if (!ok) throw ApiError.badRequest("Current password is incorrect");

  user.password = input.newPassword;
  // Invalidate existing sessions — a password change should log other devices out.
  user.refreshTokenVersion += 1;
  await user.save();

  const tokens = issueTokens(user);
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export async function getProfile(userId: string): Promise<UserSummary> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  return toUserSummary(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserSummary> {
  const update: Record<string, unknown> = {};
  if (input.firstName !== undefined) update.firstName = input.firstName;
  if (input.lastName !== undefined) update.lastName = input.lastName;
  if (input.avatarUrl !== undefined) update.avatarUrl = input.avatarUrl || undefined;

  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound("User not found");
  return toUserSummary(user);
}
