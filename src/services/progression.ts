import "server-only";
import { z } from "zod";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  achievementSchema,
  progressionSchema,
  REWARD_RANGES,
  rewardHistorySchema,
  type RewardRange,
} from "@/lib/validation/progression";
import type { Achievement, Progression, RewardHistoryPoint } from "@/types/api";
import { parseContract } from "./contract";

/** XP, levels, badges and reward history (read-only, RLS-scoped). */
export class ProgressionService {
  constructor(private readonly db: AppSupabaseClient) {}

  async get(): Promise<Progression> {
    const { data, error } = await this.db.rpc("get_progression");
    if (error) throw toAppError(error, "get_progression");
    return parseContract(progressionSchema, data, "get_progression");
  }

  async listAchievements(): Promise<Achievement[]> {
    const { data, error } = await this.db.rpc("list_achievements");
    if (error) throw toAppError(error, "list_achievements");
    return parseContract(z.array(achievementSchema), data, "list_achievements");
  }

  async getRewardHistory(range: RewardRange): Promise<RewardHistoryPoint[]> {
    const { bucket, points } = REWARD_RANGES[range];
    const { data, error } = await this.db.rpc("get_reward_history", { p_bucket: bucket, p_points: points });
    if (error) throw toAppError(error, "get_reward_history");
    return parseContract(rewardHistorySchema, data, "get_reward_history");
  }
}
