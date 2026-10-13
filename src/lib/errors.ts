import type { ApiErrorCode } from "@/types/api";

/**
 * Base class for every expected failure. `message` is safe to show to the
 * client; anything sensitive belongs in logs, never in the message.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ApiErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }

  /** Extra response headers (for example Retry-After). */
  headers(): Record<string, string> {
    return {};
  }
}

export class AuthenticationError extends AppError {
  readonly status = 401;
  readonly code = "AUTHENTICATION_REQUIRED" as const;

  constructor(message = "Authentication required") {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = "VALIDATION_FAILED" as const;
}

export class PayloadTooLargeError extends AppError {
  readonly status = 413;
  readonly code = "PAYLOAD_TOO_LARGE" as const;

  constructor(message = "Request body is too large") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = "NOT_FOUND" as const;
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = "FORBIDDEN" as const;

  constructor(message = "You do not have permission to do that") {
    super(message);
  }
}

/** The account is suspended, so it cannot earn rewards (403). */
export class AccountSuspendedError extends AppError {
  readonly status = 403;
  readonly code = "ACCOUNT_SUSPENDED" as const;

  constructor(message = "Your account is suspended, so it cannot earn rewards right now.") {
    super(message);
  }
}

export type ConflictCode =
  | "IDEMPOTENCY_CONFLICT"
  | "ALREADY_CLAIMED"
  | "MISSION_INCOMPLETE"
  | "ALREADY_EXISTS"
  | "INSUFFICIENT_BALANCE"
  | "ACTION_NOT_ALLOWED"
  | "LEVEL_REQUIRED"
  | "ALREADY_OWNED";

/** The request conflicts with the current state (409). */
export class ConflictError extends AppError {
  readonly status = 409;

  constructor(
    message: string,
    readonly code: ConflictCode = "IDEMPOTENCY_CONFLICT",
  ) {
    super(message);
  }
}

export class RateLimitError extends AppError {
  readonly status = 429;

  constructor(
    readonly code: "COOLDOWN_ACTIVE" | "DAILY_LIMIT_REACHED",
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }

  override headers(): Record<string, string> {
    return { "Retry-After": String(this.retryAfterSeconds) };
  }
}

export class InternalError extends AppError {
  readonly status = 500;
  readonly code = "INTERNAL_ERROR" as const;

  constructor(message = "Something went wrong. Please try again.", options?: ErrorOptions) {
    super(message, options);
  }
}
