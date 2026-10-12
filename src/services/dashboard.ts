import "server-only";
import { z } from "zod";
import { InternalError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { DashboardSummary, RewardSeriesPoint } from "@/types/api";

export const DEFAULT_SERIES_DAYS = 14;

const summarySchema = z.object({
  balanceCoins: z.number().int().nonnegative(),
  walletUpdatedAt: z.string(),
  totalEarnedCoins: z.number().int().nonnegative(),
  todayEarnedCoins: z.number().int().nonnegative(),
  actionsCompleted: z.number().int().nonnegative(),
  tapsToday: z.number().int().nonnegative(),
  lastTapAt: z.string().nullable(),
  policy: z.object({
    rewardCoins: z.number().int().positive(),
    cooldownMs: z.number().int().nonnegative(),
    dailyLimit: z.number().int().positive(),
  }),
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});

const seriesSchema = z.array(z.object({ day: z.iso.date(), coins: z.number().int().nonnegative() }));

/** Aggregates computed in the database from real ledger rows. */
export class DashboardService {
  constructor(private readonly db: AppSupabaseClient) {}

  async getSummary(): Promise<DashboardSummary> {
    const { data, error } = await this.db.rpc("get_dashboard_summary");
    if (error) throw toAppError(error, "get_dashboard_summary");
    return this.parse(summarySchema, data, "get_dashboard_summary");
  }

  async getRewardSeries(days: number = DEFAULT_SERIES_DAYS): Promise<RewardSeriesPoint[]> {
    const { data, error } = await this.db.rpc("get_reward_series", { p_days: days });
    if (error) throw toAppError(error, "get_reward_series");
    return this.parse(seriesSchema, data, "get_reward_series");
  }

  private parse<T>(schema: z.ZodType<T>, data: unknown, operation: string): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      logger.error("contract_violation", { operation });
      throw new InternalError();
    }
    return parsed.data;
  }
}
