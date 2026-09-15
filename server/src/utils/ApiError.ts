/**
 * Operational error with an HTTP status attached.
 *
 * "Operational" means: expected, caused by the client, safe to expose.
 * Anything thrown that is NOT an ApiError is treated as a programmer error
 * and gets its message hidden in production (see the global error handler).
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational = true;
  public readonly code?: string;
  public readonly errors?: Record<string, string[]>;

  constructor(
    statusCode: number,
    message: string,
    options: { code?: string; errors?: Record<string, string[]> } = {},
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = options.code;
    this.errors = options.errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request", errors?: Record<string, string[]>) {
    return new ApiError(400, message, { errors });
  }

  static unauthorized(message = "Not authenticated") {
    return new ApiError(401, message, { code: "UNAUTHENTICATED" });
  }

  static forbidden(message = "You do not have permission to do that") {
    return new ApiError(403, message, { code: "FORBIDDEN" });
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, message, { code: "NOT_FOUND" });
  }

  static conflict(message = "Resource already exists") {
    return new ApiError(409, message, { code: "CONFLICT" });
  }

  static tooMany(message = "Too many requests") {
    return new ApiError(429, message, { code: "RATE_LIMITED" });
  }

  static internal(message = "Something went wrong") {
    return new ApiError(500, message, { code: "INTERNAL" });
  }
}
