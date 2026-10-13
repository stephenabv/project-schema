import { z } from "zod";
import type { RewardBucket } from "@/types/api";

const count = z.number().int().nonnegative();

export const unlockedAchievementSchema = z.object({
  slug: z.string(),
  title: z.string(),
  icon: z.string(),
  rewardCoins: count,
  xpReward: count,
});

/** XP, level and newly unlocked badges, returned by every reward function. */
export const progressDeltaSchema = z.object({
  xpTotal: count,
  level: z.number().int().positive(),
  unlockedAchievements: z.array(unlockedAchievementSchema),
});

export const ACHIEVEMENT_METRICS = [
  "total_taps",
  "total_coins_earned",
  "missions_completed",
  "level",
  "longest_streak",
] as const;

export const achievementSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
  metric: z.enum(ACHIEVEMENT_METRICS),
  threshold: z.number().int().positive(),
  progress: count,
  rewardCoins: count,
  xpReward: count,
  unlocked: z.boolean(),
  unlockedAt: z.string().nullable(),
});

export const progressionSchema = z.object({
  xpTotal: count,
  level: z.number().int().positive(),
  levelStartXp: count,
  nextLevelXp: z.number().int().positive(),
  totalTaps: count,
  totalCoinsEarned: count,
  missionsCompleted: count,
  achievementsUnlocked: count,
  achievementsTotal: count,
  nextAchievement: achievementSchema.nullable(),
});

export const REWARD_RANGES = {
  "14d": { bucket: "day", points: 14, label: "14 days" },
  "12w": { bucket: "week", points: 12, label: "12 weeks" },
  "12m": { bucket: "month", points: 12, label: "12 months" },
} as const satisfies Record<string, { bucket: RewardBucket; points: number; label: string }>;

export type RewardRange = keyof typeof REWARD_RANGES;

export const rewardRangeSchema = z.enum(Object.keys(REWARD_RANGES) as [RewardRange, ...RewardRange[]]).catch("14d");

export const rewardHistorySchema = z.array(
  z.object({ period_start: z.iso.date(), coins: count }).transform((row) => ({
    periodStart: row.period_start,
    coins: row.coins,
  })),
);
