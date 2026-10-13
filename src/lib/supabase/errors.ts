import {
  AccountSuspendedError,
  AppError,
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

/** The subset of a PostgrestError this module relies on. */
export interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * Translates SQLSTATE codes raised by our database functions into domain
 * errors. Raw database messages are never forwarded to clients.
 */
export function toAppError(error: DatabaseError, operation: string): AppError {
  switch (error.code) {
    case "28000":
    case "PGRST301": // JWT expired or invalid
      return new AuthenticationError();
    case "22023":
    case "22P02": // invalid input syntax (for example a malformed uuid)
      return new ValidationError("The request contained invalid values");
    case "P0002":
      return new NotFoundError("Wallet not found");
    case "VE001":
      return new RateLimitError("COOLDOWN_ACTIVE", "Tap cooldown active. Try again in a moment.", 1);
    case "VE002":
      return new RateLimitError(
        "DAILY_LIMIT_REACHED",
        "Daily tap limit reached. Come back tomorrow (UTC).",
        secondsUntilNextUtcDay(),
      );
    case "VE003":
      return new ConflictError("This request key was already used for a different action");
    case "VE004":
      return new ConflictError("Mission already claimed for this period", "ALREADY_CLAIMED");
    case "VE005":
      return new ConflictError("Mission objective not complete yet", "MISSION_INCOMPLETE");
    case "VE006":
      return new AccountSuspendedError();
    case "VE008":
      return new ConflictError("That adjustment would make the balance negative", "INSUFFICIENT_BALANCE");
    case "VE010":
      return new NotFoundError("This mission is not available");
    case "VE011":
      return new ConflictError("That action is not allowed for this account or record", "ACTION_NOT_ALLOWED");
    case "VE012":
      return new NotFoundError("Record not found");
    case "23505": // unique_violation (a taken username or slug)
      return new ConflictError("That value is already taken", "ALREADY_EXISTS");
    case "23502": // not_null_violation
    case "23514": // check_violation
      return new ValidationError("The request contained invalid values");
    case "42501":
      return new ForbiddenError();
    default:
      logger.error("database_operation_failed", { operation, code: error.code ?? "unknown" });
      return new InternalError();
  }
}

export function secondsUntilNextUtcDay(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
