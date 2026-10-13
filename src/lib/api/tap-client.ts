import type { ApiErrorBody, TapResponse } from "@/types/api";

export type TapOutcome =
  | { kind: "success"; data: TapResponse }
  | { kind: "cooldown"; retryAfterMs: number }
  | { kind: "daily_limit" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type Sleep = (ms: number) => Promise<void>;

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const DEFAULT_BACKOFF_MS = [300, 900] as const;

/**
 * Browser client for POST /api/earn/tap. Network failures and gateway errors
 * are retried with the SAME idempotency key, so a request that reached the
 * server is never rewarded twice.
 */
export class TapClient {
  constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly backoffMs: readonly number[] = DEFAULT_BACKOFF_MS,
  ) {}

  async tap(idempotencyKey: string): Promise<TapOutcome> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl("/api/earn/tap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey }),
          credentials: "same-origin",
        });
      } catch {
        if (attempt < this.backoffMs.length) {
          await this.sleep(this.backoffMs[attempt]);
          continue;
        }
        return { kind: "error", message: "Network error. Check your connection and try again." };
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.backoffMs.length) {
        await this.sleep(this.backoffMs[attempt]);
        continue;
      }

      return this.toOutcome(response);
    }
  }

  private async toOutcome(response: Response): Promise<TapOutcome> {
    const body = (await response.json().catch(() => null)) as TapResponse | ApiErrorBody | null;

    if (response.ok && body && "success" in body) return { kind: "success", data: body };
    if (response.status === 401) return { kind: "unauthenticated" };

    const code = body && "code" in body ? body.code : undefined;
    if (response.status === 429 && code === "DAILY_LIMIT_REACHED") return { kind: "daily_limit" };
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After") ?? "1");
      return { kind: "cooldown", retryAfterMs: Math.max(1, Number.isFinite(seconds) ? seconds : 1) * 1000 };
    }

    return {
      kind: "error",
      message: body && "error" in body ? body.error : "Unable to process the tap. Please try again.",
    };
  }
}
