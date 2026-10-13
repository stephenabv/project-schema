import type { ClaimResponse } from "@/types/api";
import {
  DEFAULT_BACKOFF_MS,
  errorCodeOf,
  errorMessageOf,
  IdempotentPoster,
  NETWORK_ERROR_MESSAGE,
  type FetchLike,
  type Sleep,
} from "./idempotent-post";

export type ClaimOutcome =
  | { kind: "success"; data: ClaimResponse }
  | { kind: "already_claimed" }
  | { kind: "incomplete" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/** Browser client for POST /api/tasks/:id/claim (retries reuse the idempotency key). */
export class ClaimClient {
  private readonly poster: IdempotentPoster;

  constructor(fetchImpl?: FetchLike, sleep?: Sleep, backoffMs: readonly number[] = DEFAULT_BACKOFF_MS) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  async claim(taskId: string, idempotencyKey: string): Promise<ClaimOutcome> {
    const result = await this.poster.post(`/api/tasks/${encodeURIComponent(taskId)}/claim`, { idempotencyKey });
    if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };

    const { response, body } = result;
    if (response.ok && body && typeof body === "object" && "success" in body) {
      return { kind: "success", data: body as ClaimResponse };
    }
    if (response.status === 401) return { kind: "unauthenticated" };

    const code = errorCodeOf(body);
    if (code === "ALREADY_CLAIMED") return { kind: "already_claimed" };
    if (code === "MISSION_INCOMPLETE") return { kind: "incomplete" };

    return { kind: "error", message: errorMessageOf(body, "Unable to claim this mission. Please try again.") };
  }
}
