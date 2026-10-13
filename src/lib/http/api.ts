import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { AppError, InternalError, PayloadTooLargeError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ApiErrorBody } from "@/types/api";

/** User-specific data must never be stored by shared caches. */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function json<T>(body: T, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse<T> {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

export function errorResponse(error: AppError): NextResponse<ApiErrorBody> {
  return json<ApiErrorBody>(
    { error: error.message, code: error.code },
    { status: error.status, headers: error.headers() },
  );
}

/**
 * Wraps a route handler so every failure becomes a consistent JSON error.
 * Unexpected errors are logged by name only and returned as a generic 500.
 */
export function apiHandler<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Let Next.js control-flow errors (prerender bailouts, redirects) through.
      unstable_rethrow(error);
      if (error instanceof AppError) {
        if (error.status >= 500) logger.error("api_error", { route, code: error.code });
        return errorResponse(error);
      }
      logger.error("api_unhandled_error", { route, name: error instanceof Error ? error.name : "unknown" });
      return errorResponse(new InternalError());
    }
  };
}

export const MAX_JSON_BODY_BYTES = 1024;

/**
 * Reads a small JSON body with a hard size cap. The Content-Length header is
 * checked first, then the actual byte length (the header can be absent or
 * wrong).
 */
export async function readJsonBody(request: Request, maxBytes: number = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ValidationError("Content-Type must be application/json");
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError();

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new PayloadTooLargeError();

  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}
