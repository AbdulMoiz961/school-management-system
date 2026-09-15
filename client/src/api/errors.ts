import type { ApiErrorBody } from "@sms/shared";

/** Error thrown by the API client, carrying the parsed server body. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly errors?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || "Request failed");
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.code;
    if (body.errors) this.errors = body.errors;
  }

  /** True when the server said the access token expired (client should refresh). */
  get isTokenExpired(): boolean {
    return this.code === "TOKEN_EXPIRED" || this.status === 401;
  }

  /** Flattens field errors into a single readable string. */
  get fieldMessage(): string {
    if (!this.errors) return this.message;
    const first = Object.entries(this.errors)[0];
    if (!first) return this.message;
    const [field, msgs] = first;
    return `${field}: ${msgs[0]}`;
  }
}
