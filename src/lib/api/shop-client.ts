import type { EquippedCosmetics, PurchaseResult } from "@/lib/validation/engagement";
import {
  DEFAULT_BACKOFF_MS,
  errorCodeOf,
  errorMessageOf,
  IdempotentPoster,
  NETWORK_ERROR_MESSAGE,
  type FetchLike,
  type Sleep,
} from "./idempotent-post";

export type PurchaseOutcome =
  | { kind: "success"; data: PurchaseResult }
  | { kind: "insufficient_balance" }
  | { kind: "level_required" }
  | { kind: "already_owned" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

export type EquipOutcome =
  | { kind: "success"; data: EquippedCosmetics }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

const PURCHASE_CODES = {
  INSUFFICIENT_BALANCE: "insufficient_balance",
  LEVEL_REQUIRED: "level_required",
  ALREADY_OWNED: "already_owned",
} as const;

/** Browser client for the shop endpoints. Purchases retry with the same idempotency key. */
export class ShopClient {
  private readonly poster: IdempotentPoster;

  constructor(fetchImpl?: FetchLike, sleep?: Sleep, backoffMs: readonly number[] = DEFAULT_BACKOFF_MS) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  async purchase(itemId: string, idempotencyKey: string): Promise<PurchaseOutcome> {
    const result = await this.poster.post(`/api/shop/${encodeURIComponent(itemId)}/purchase`, { idempotencyKey });
    if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };

    const { response, body } = result;
    if (response.ok && body && typeof body === "object" && "success" in body) {
      return { kind: "success", data: body as PurchaseResult };
    }
    if (response.status === 401) return { kind: "unauthenticated" };

    const code = errorCodeOf(body);
    if (code && code in PURCHASE_CODES) return { kind: PURCHASE_CODES[code as keyof typeof PURCHASE_CODES] };

    return { kind: "error", message: errorMessageOf(body, "Unable to buy this item. Please try again.") };
  }

  async equip(itemId: string, equip: boolean): Promise<EquipOutcome> {
    const result = await this.poster.post(`/api/shop/${encodeURIComponent(itemId)}/equip`, { equip });
    if (result.kind === "network_error") return { kind: "error", message: NETWORK_ERROR_MESSAGE };

    const { response, body } = result;
    if (response.ok && body && typeof body === "object" && "tapSkin" in body) {
      return { kind: "success", data: body as EquippedCosmetics };
    }
    if (response.status === 401) return { kind: "unauthenticated" };

    return { kind: "error", message: errorMessageOf(body, "Unable to update this item. Please try again.") };
  }
}
