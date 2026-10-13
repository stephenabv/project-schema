import type { TapResponse } from "@/types/api";
import {
  DEFAULT_BACKOFF_MS,
  errorCodeOf,
  errorMessageOf,
  IdempotentPoster,
  NETWORK_ERROR_MESSAGE,
  type FetchLike,
  type Sleep,
} from "./idempotent-post";

export type TapOutcome =
  | { kind: "success"; data: TapResponse }
  | { kind: "cooldown"; retryAfterMs: number }
  | { kind: "daily_limit" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/** Browser client for POST /api/earn/tap (retries reuse the idempotency key). */
export class TapClient {
  private readonly poster: IdempotentPoster;

  constructor(fetchImpl?: FetchLike, sleep?: Sleep, backoffMs: readonly number[] = DEFAULT_BACKOFF_MS) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  async tap(idempotencyKey: string): Promise<TapOutcome> {
    const result = await this.poster.post("/api/earn/tap", { idempotencyKey });
    if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };

    const { response, body } = result;
    if (response.ok && body && typeof body === "object" && "success" in body) {
      return { kind: "success", data: body as TapResponse };
    }
    if (response.status === 401) return { kind: "unauthenticated" };

    if (response.status === 429 && errorCodeOf(body) === "DAILY_LIMIT_REACHED") return { kind: "daily_limit" };
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After") ?? "1");
      return { kind: "cooldown", retryAfterMs: Math.max(1, Number.isFinite(seconds) ? seconds : 1) * 1000 };
    }

    return { kind: "error", message: errorMessageOf(body, "Unable to process the tap. Please try again.") };
  }
}
