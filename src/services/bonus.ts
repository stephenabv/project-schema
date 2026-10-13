import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  dailyBonusClaimSchema,
  dailyBonusStatusSchema,
  type DailyBonusClaim,
  type DailyBonusStatus,
} from "@/lib/validation/engagement";
import { parseContract } from "./contract";

/**
 * The once-per-UTC-day check-in bonus. The streak, the amount and the
 * one-claim-per-day rule are all decided by public.claim_daily_bonus.
 */
export class BonusService {
  constructor(private readonly db: AppSupabaseClient) {}

  async status(): Promise<DailyBonusStatus> {
    const { data, error } = await this.db.rpc("get_daily_bonus_status");
    if (error) throw toAppError(error, "get_daily_bonus_status");
    return parseContract(dailyBonusStatusSchema, data, "get_daily_bonus_status");
  }

  async claim(idempotencyKey: string): Promise<DailyBonusClaim> {
    const { data, error } = await this.db.rpc("claim_daily_bonus", { p_idempotency_key: idempotencyKey });
    if (error) throw toAppError(error, "claim_daily_bonus");
    return parseContract(dailyBonusClaimSchema, data, "claim_daily_bonus");
  }
}
