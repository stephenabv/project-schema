import type { CollectResult, GeneratorStatus, UpgradeResult } from "@/lib/validation/operations";
import {
  DEFAULT_BACKOFF_MS,
  errorCodeOf,
  errorMessageOf,
  IdempotentPoster,
  NETWORK_ERROR_MESSAGE,
  type FetchLike,
  type Sleep,
} from "./idempotent-post";

type Failure =
  | { kind: "insufficient_balance" }
  | { kind: "max_level" }
  | { kind: "nothing_to_collect" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

export type CollectOutcome = { kind: "success"; data: CollectResult } | Failure;
export type UpgradeOutcome = { kind: "success"; data: UpgradeResult } | Failure;

const FAILURE_CODES = {
  INSUFFICIENT_BALANCE: "insufficient_balance",
  ACTION_NOT_ALLOWED: "max_level",
  NOTHING_TO_COLLECT: "nothing_to_collect",
} as const;

/** Browser client for the idle generator. Retries reuse the idempotency key. */
export class GeneratorClient {
  private readonly poster: IdempotentPoster;

  constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    sleep?: Sleep,
    backoffMs: readonly number[] = DEFAULT_BACKOFF_MS,
  ) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  collect(idempotencyKey: string): Promise<CollectOutcome> {
    return this.send<CollectResult>("/api/generator/collect", idempotencyKey, "Unable to collect right now.");
  }

  upgrade(idempotencyKey: string): Promise<UpgradeOutcome> {
    return this.send<UpgradeResult>("/api/generator/upgrade", idempotencyKey, "Unable to upgrade right now.");
  }

  /** The current status, or null when it cannot be read. */
  async status(): Promise<GeneratorStatus | null> {
    try {
      const response = await this.fetchImpl("/api/generator", { method: "GET", credentials: "same-origin" });
      return response.ok ? ((await response.json()) as GeneratorStatus) : null;
    } catch {
      return null;
    }
  }

  private async send<T>(
    url: string,
    idempotencyKey: string,
    fallback: string,
  ): Promise<{ kind: "success"; data: T } | Failure> {
    const result = await this.poster.post(url, { idempotencyKey });
    if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };

    const { response, body } = result;
    if (response.ok && body && typeof body === "object" && "success" in body) return { kind: "success", data: body as T };
    if (response.status === 401) return { kind: "unauthenticated" };

    const code = errorCodeOf(body);
    if (code && Object.hasOwn(FAILURE_CODES, code)) return { kind: FAILURE_CODES[code as keyof typeof FAILURE_CODES] };
    return { kind: "error", message: errorMessageOf(body, fallback) };
  }
}

/** Client-side estimate of accrued coins for display; the server decides the real amount. */
export function estimatePending(status: GeneratorStatus, renderedAt: number, now: number): number {
  if (status.level === 0) return 0;
  const capCoins = status.coinsPerHour * status.capHours;
  const extra = Math.max(0, now - renderedAt) / 3_600_000 * status.coinsPerHour;
  return Math.min(capCoins, Math.floor(status.pendingCoins + extra));
}
