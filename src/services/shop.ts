import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  equippedCosmeticsSchema,
  purchaseResultSchema,
  shopSchema,
  type EquippedCosmetics,
  type PurchaseResult,
  type Shop,
} from "@/lib/validation/engagement";
import { parseContract } from "./contract";

/**
 * Cosmetic shop. Prices, level gates, balance checks and ownership are
 * enforced by the database; the client only names an item.
 */
export class ShopService {
  constructor(private readonly db: AppSupabaseClient) {}

  async list(): Promise<Shop> {
    const { data, error } = await this.db.rpc("list_shop");
    if (error) throw toAppError(error, "list_shop");
    return parseContract(shopSchema, data, "list_shop");
  }

  async equipped(): Promise<EquippedCosmetics> {
    const { data, error } = await this.db.rpc("get_equipped_cosmetics");
    if (error) throw toAppError(error, "get_equipped_cosmetics");
    return parseContract(equippedCosmeticsSchema, data, "get_equipped_cosmetics");
  }

  async purchase(itemId: string, idempotencyKey: string): Promise<PurchaseResult> {
    const { data, error } = await this.db.rpc("purchase_item", {
      p_item_id: itemId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toAppError(error, "purchase_item");
    return parseContract(purchaseResultSchema, data, "purchase_item");
  }

  async equip(itemId: string, equip: boolean): Promise<EquippedCosmetics> {
    const { data, error } = await this.db.rpc("equip_item", { p_item_id: itemId, p_equip: equip });
    if (error) throw toAppError(error, "equip_item");
    return parseContract(equippedCosmeticsSchema, data, "equip_item");
  }
}
