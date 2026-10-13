import type {
  RobotCollectResult,
  RobotGenerator,
  RobotPurchaseResult,
  RobotToggleResult,
} from "@/lib/validation/robots";
import {
  DEFAULT_BACKOFF_MS,
  errorCodeOf,
  errorMessageOf,
  IdempotentPoster,
  NETWORK_ERROR_MESSAGE,
  type FetchLike,
  type Sleep,
} from "./idempotent-post";

/** A failed call: `code` is the API error code when the server sent one. */
export type ApiFailure = { kind: "unauthenticated" } | { kind: "error"; code?: string; message: string };
export type ApiOutcome<T> = { kind: "success"; data: T } | ApiFailure;

/**
 * Posts with retries that reuse the body (and so the idempotency key) and
 * maps the response to an outcome. Shared by the robot and redemption clients.
 */
export async function postOutcome<T>(
  poster: IdempotentPoster,
  url: string,
  body: unknown,
  isSuccess: (body: unknown) => boolean,
  fallback: string,
): Promise<ApiOutcome<T>> {
  const result = await poster.post(url, body);
  if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };
  const { response, body: payload } = result;
  if (response.ok && isSuccess(payload)) return { kind: "success", data: payload as T };
  if (response.status === 401) return { kind: "unauthenticated" };
  return { kind: "error", code: errorCodeOf(payload), message: errorMessageOf(payload, fallback) };
}

const hasSuccess = (body: unknown) => Boolean(body && typeof body === "object" && "success" in body);

/** Browser client for the robot shop and generator. */
export class RobotClient {
  private readonly poster: IdempotentPoster;

  constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    sleep?: Sleep,
    backoffMs: readonly number[] = DEFAULT_BACKOFF_MS,
  ) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  purchase(robotId: string, idempotencyKey: string): Promise<ApiOutcome<RobotPurchaseResult>> {
    return postOutcome(
      this.poster,
      `/api/robots/${encodeURIComponent(robotId)}/purchase`,
      { idempotencyKey },
      hasSuccess,
      "Unable to buy this robot. Please try again.",
    );
  }

  collect(idempotencyKey: string): Promise<ApiOutcome<RobotCollectResult>> {
    return postOutcome(this.poster, "/api/robots/generator/collect", { idempotencyKey }, hasSuccess, "Unable to collect right now.");
  }

  setActive(userRobotId: string, active: boolean, idempotencyKey: string): Promise<ApiOutcome<RobotToggleResult>> {
    return postOutcome(
      this.poster,
      `/api/robots/owned/${encodeURIComponent(userRobotId)}/active`,
      { active, idempotencyKey },
      hasSuccess,
      "Unable to update this robot right now.",
    );
  }

  /** The generator as the server sees it now, or null when it cannot be read. */
  async generator(): Promise<RobotGenerator | null> {
    try {
      const response = await this.fetchImpl("/api/robots/generator", { method: "GET", credentials: "same-origin" });
      return response.ok ? ((await response.json()) as RobotGenerator) : null;
    } catch {
      return null;
    }
  }
}

/**
 * Display-only estimate of a robot's accrued coins `now`, from the server's
 * figure at `renderedAt`. The server decides what is actually paid.
 */
export function estimateRobotPending(
  robot: { isActive: boolean; pendingCoins: number; coinsPerHour: number },
  capHours: number,
  renderedAt: number,
  now: number,
): number {
  if (!robot.isActive) return 0;
  const extra = (Math.max(0, now - renderedAt) / 3_600_000) * robot.coinsPerHour;
  return Math.min(robot.coinsPerHour * capHours, Math.floor(robot.pendingCoins + extra));
}
