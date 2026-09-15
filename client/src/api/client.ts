import type { ApiErrorBody, ApiSuccess, AuthResult, UserSummary } from "@sms/shared";
import { ApiClientError } from "./errors";

/**
 * Token storage.
 *
 * The access token lives in memory ONLY (not localStorage) — a XSS payload can't
 * read a module-scoped variable, but it can read localStorage. The refresh token
 * is an httpOnly cookie the browser sends automatically and JS cannot touch.
 *
 * Trade-off: a page reload loses the in-memory token, so the app silently calls
 * /api/auth/refresh on boot to restore the session.
 */
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};

/** Base path. In dev, Vite proxies /api → localhost:5000 (same-origin, cookies work). */
const BASE = "/api";

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Expected JSON but got: ${text.slice(0, 120)}`);
  }
  return json as T;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Set false for the refresh call itself, to avoid recursion. */
  retryOn401?: boolean;
  signal?: AbortSignal;
}

/** Called when refresh fails — the auth provider registers a handler to log out. */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for a new access token. Deduped across callers. */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return false;
      const json = await parse<ApiSuccess<AuthResult>>(res);
      tokenStore.set(json.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      // Allow a later call to try again.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

/**
 * Core request function.
 *
 * Automatically:
 *  - attaches the Bearer token
 *  - sends cookies (credentials: include)
 *  - on 401, attempts ONE silent refresh and replays the request
 *  - throws ApiClientError with the parsed body otherwise
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, retryOn401 = true, signal } = options;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    return fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  };

  let res = await doFetch();

  // Silent refresh-and-retry on an expired access token.
  if (res.status === 401 && retryOn401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      tokenStore.clear();
      onAuthFailure?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const json = await parse<ApiSuccess<T> | ApiErrorBody>(res);

  if (!res.ok) {
    throw new ApiClientError(res.status, json as ApiErrorBody);
  }

  return (json as ApiSuccess<T>).data;
}

/** Convenience wrappers. */
export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "DELETE" }),
};

export type { UserSummary };
