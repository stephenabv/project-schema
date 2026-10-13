import type { DailyBonusClaim } from "@/lib/validation/engagement";
import {
  DEFAULT_BACKOFF_MS,
  errorCodeOf,
  errorMessageOf,
  IdempotentPoster,
  NETWORK_ERROR_MESSAGE,
  type FetchLike,
  type Sleep,
} from "./idempotent-post";

export type BonusOutcome =
  | { kind: "success"; data: DailyBonusClaim }
  | { kind: "already_claimed" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/** Browser client for POST /api/daily-bonus (retries reuse the idempotency key). */
export class BonusClient {
  private readonly poster: IdempotentPoster;

  constructor(fetchImpl?: FetchLike, sleep?: Sleep, backoffMs: readonly number[] = DEFAULT_BACKOFF_MS) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  async claim(idempotencyKey: string): Promise<BonusOutcome> {
    const result = await this.poster.post("/api/daily-bonus", { idempotencyKey });
    if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };

    const { response, body } = result;
    if (response.ok && body && typeof body === "object" && "success" in body) {
      return { kind: "success", data: body as DailyBonusClaim };
    }
    if (response.status === 401) return { kind: "unauthenticated" };
    if (errorCodeOf(body) === "ALREADY_CLAIMED") return { kind: "already_claimed" };

    return { kind: "error", message: errorMessageOf(body, "Unable to claim the daily bonus. Please try again.") };
  }
}
