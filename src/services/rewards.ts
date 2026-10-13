import "server-only";
import { InternalError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { tapResultSchema } from "@/lib/validation/earn";
import type { TapResponse } from "@/types/api";

/**
 * Reward processing. The database function is authoritative for the reward
 * amount, cooldown, daily limit and idempotency; this service only forwards
 * the caller's idempotency key and validates the result contract.
 */
export class RewardService {
  constructor(private readonly db: AppSupabaseClient) {}

  async processTap(idempotencyKey: string): Promise<TapResponse> {
    const { data, error } = await this.db.rpc("process_tap", { p_idempotency_key: idempotencyKey });
    if (error) throw toAppError(error, "process_tap");

    const parsed = tapResultSchema.safeParse(data);
    if (!parsed.success) {
      logger.error("contract_violation", { operation: "process_tap" });
      throw new InternalError();
    }
    return parsed.data;
  }
}
