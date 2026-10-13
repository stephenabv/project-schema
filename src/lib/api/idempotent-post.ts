export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export type PostResult = { kind: "response"; response: Response; body: unknown } | { kind: "network_error" };

const RETRYABLE_STATUS = new Set([502, 503, 504]);
export const DEFAULT_BACKOFF_MS = [300, 900] as const;

/**
 * Browser helper for reward endpoints. Network failures and gateway errors
 * are retried with the SAME body (and therefore the same idempotency key), so
 * a request that already reached the server is never rewarded twice.
 */
export class IdempotentPoster {
  constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly backoffMs: readonly number[] = DEFAULT_BACKOFF_MS,
  ) {}

  async post(url: string, body: unknown): Promise<PostResult> {
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          credentials: "same-origin",
        });
      } catch {
        if (attempt < this.backoffMs.length) {
          await this.sleep(this.backoffMs[attempt]);
          continue;
        }
        return { kind: "network_error" };
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.backoffMs.length) {
        await this.sleep(this.backoffMs[attempt]);
        continue;
      }

      return { kind: "response", response, body: await response.json().catch(() => null) };
    }
  }
}

/** The error message from an API error body, or a fallback. */
export function errorMessageOf(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function errorCodeOf(body: unknown): string | undefined {
  return body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : undefined;
}

export const NETWORK_ERROR_MESSAGE = "Network error. Check your connection and try again.";
