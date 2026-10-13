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

/** An admin turned this feature off (403). */
export class FeatureDisabledError extends AppError {
  readonly status = 403;
  readonly code = "FEATURE_DISABLED" as const;

  constructor(message = "This feature is turned off right now.") {
    super(message);
  }
}

/** Maintenance mode: earning and spending are paused (503). */
export class MaintenanceError extends AppError {
  readonly status = 503;
  readonly code = "MAINTENANCE_MODE" as const;

  constructor(message = "Virtual Earn is in maintenance. Earning and spending are paused for a moment.") {
    super(message);
  }

  override headers(): Record<string, string> {
    return { "Retry-After": "60" };
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
  | "ALREADY_OWNED"
  | "NOTHING_TO_COLLECT"
  | "LIMIT_REACHED"
  | "RATE_CHANGED"
  | "AMOUNT_OUT_OF_RANGE"
  | "INVALID_STATUS"
  | "CONFIRMATION_REQUIRED";

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
    readonly code: "COOLDOWN_ACTIVE" | "DAILY_LIMIT_REACHED" | "TAP_RATE_LIMITED",
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }

  override headers(): Record<string, string> {
    return { "Retry-After": String(this.retryAfterSeconds) };
  }
}

/** A required server-side setting (for example an encryption key) is missing (503). */
export class NotConfiguredError extends AppError {
  readonly status = 503;
  readonly code = "NOT_CONFIGURED" as const;

  constructor(message = "This feature is not set up yet.") {
    super(message);
  }
}

export class InternalError extends AppError {
  readonly status = 500;
  readonly code = "INTERNAL_ERROR" as const;

  constructor(message = "Something went wrong. Please try again.", options?: ErrorOptions) {
    super(message, options);
  }
}
