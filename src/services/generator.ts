import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  collectResultSchema,
  generatorStatusSchema,
  upgradeResultSchema,
  type CollectResult,
  type GeneratorStatus,
  type UpgradeResult,
} from "@/lib/validation/operations";
import { parseContract } from "./contract";

/**
 * The idle generator. Accrual, the storage cap, upgrade prices and payouts
 * are computed by the database from server time; the client sends only an
 * idempotency key.
 */
export class GeneratorService {
  constructor(private readonly db: AppSupabaseClient) {}

  async status(): Promise<GeneratorStatus> {
    const { data, error } = await this.db.rpc("get_generator_status");
    if (error) throw toAppError(error, "get_generator_status");
    return parseContract(generatorStatusSchema, data, "get_generator_status");
  }

  async collect(idempotencyKey: string): Promise<CollectResult> {
    const { data, error } = await this.db.rpc("collect_generator", { p_idempotency_key: idempotencyKey });
    if (error) throw toAppError(error, "collect_generator");
    return parseContract(collectResultSchema, data, "collect_generator");
  }

  async upgrade(idempotencyKey: string): Promise<UpgradeResult> {
    const { data, error } = await this.db.rpc("upgrade_generator", { p_idempotency_key: idempotencyKey });
    if (error) throw toAppError(error, "upgrade_generator");
    return parseContract(upgradeResultSchema, data, "upgrade_generator");
  }
}
