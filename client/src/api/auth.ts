import type { AuthResult, UserSummary } from "@sms/shared";
import { api, setAuthFailureHandler, tokenStore } from "@/api/client";

const AUTH = "/auth";

export const authApi = {
  /** POST /api/auth/login — sets the refresh cookie, returns user + access token. */
  login: (email: string, password: string) =>
    api.post<AuthResult>(`${AUTH}/login`, { email, password }, { retryOn401: false }),

  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => api.post<AuthResult>(`${AUTH}/register`, input, { retryOn401: false }),

  logout: () => api.post<{ message: string }>(`${AUTH}/logout`),

  me: () => api.get<UserSummary>(`${AUTH}/me`),

  updateMe: (input: { firstName?: string; lastName?: string; avatarUrl?: string }) =>
    api.patch<UserSummary>(`${AUTH}/me`, input),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ accessToken: string }>(`${AUTH}/change-password`, {
      currentPassword,
      newPassword,
    }),

  /** Silently restores a session on page load using the httpOnly refresh cookie. */
  async restore(): Promise<AuthResult | null> {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data: AuthResult };
      tokenStore.set(json.data.accessToken);
      return json.data;
    } catch {
      return null;
    }
  },
};

export { setAuthFailureHandler };
