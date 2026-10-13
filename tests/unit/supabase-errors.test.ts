import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationError,
  ConflictError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";
import { secondsUntilNextUtcDay, toAppError } from "@/lib/supabase/errors";

describe("toAppError", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["28000", AuthenticationError, 401],
    ["PGRST301", AuthenticationError, 401],
    ["22023", ValidationError, 400],
    ["P0002", NotFoundError, 404],
    ["VE003", ConflictError, 409],
  ])("maps %s", (code, ErrorClass, status) => {
    const error = toAppError({ code }, "op");
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.status).toBe(status);
  });

  it("maps the cooldown with a one second Retry-After", () => {
    const error = toAppError({ code: "VE001" }, "op") as RateLimitError;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.code).toBe("COOLDOWN_ACTIVE");
    expect(error.headers()).toEqual({ "Retry-After": "1" });
  });

  it("maps the daily limit", () => {
    const error = toAppError({ code: "VE002" }, "op") as RateLimitError;
    expect(error.code).toBe("DAILY_LIMIT_REACHED");
    expect(error.status).toBe(429);
  });

  it("hides unknown database errors behind a generic 500 and logs only the code", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = toAppError({ code: "XX000", message: "secret internal detail" }, "process_tap");
    expect(error).toBeInstanceOf(InternalError);
    expect(error.message).not.toContain("secret");
    expect(log.mock.calls[0][0]).not.toContain("secret");
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ operation: "process_tap", code: "XX000" });
  });

  it("computes seconds until the next UTC midnight", () => {
    expect(secondsUntilNextUtcDay(new Date("2026-10-12T23:59:30Z"))).toBe(30);
    expect(secondsUntilNextUtcDay(new Date("2026-10-12T00:00:00Z"))).toBe(86_400);
  });
});
