/**
 * Public API contracts. Every balance is virtual: `currency` is always "VC"
 * and `redeemable` is always false.
 */
import type { TransactionType } from "./database";

export type VirtualCurrency = "VC";

export interface VirtualAmount {
  currency: VirtualCurrency;
  redeemable: false;
}

export interface UnlockedAchievement {
  slug: string;
  title: string;
  icon: string;
  rewardCoins: number;
  xpReward: number;
}

/** XP, level and badges returned with every reward. */
export interface ProgressDelta {
  xpTotal: number;
  level: number;
  unlockedAchievements: UnlockedAchievement[];
}

export interface TapResponse extends VirtualAmount, ProgressDelta {
  success: true;
  duplicate: boolean;
  transactionId: string;
  rewardCoins: number;
  balanceCoins: number;
  tapsToday: number;
  xpEarned: number;
}

export interface WalletResponse extends VirtualAmount {
  balanceCoins: number;
  label: "Virtual coins";
  updatedAt: string;
}

export interface TransactionDto {
  id: string;
  amountCoins: number;
  type: TransactionType;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

export interface TransactionPage {
  items: TransactionDto[];
  nextCursor: string | null;
  currency: VirtualCurrency;
  redeemable: false;
}

export interface TapPolicy {
  rewardCoins: number;
  cooldownMs: number;
  dailyLimit: number;
  xpPerTap: number;
}

export interface DashboardSummary extends VirtualAmount {
  balanceCoins: number;
  walletUpdatedAt: string;
  totalEarnedCoins: number;
  todayEarnedCoins: number;
  actionsCompleted: number;
  tapsToday: number;
  lastTapAt: string | null;
  policy: TapPolicy;
}

export interface RewardSeriesPoint {
  day: string;
  coins: number;
}

export type RewardBucket = "day" | "week" | "month";

export interface RewardHistoryPoint {
  periodStart: string;
  coins: number;
}

export type MissionFrequency = "daily" | "weekly" | "once";
export type MissionObjective = "taps" | "missions";

export interface Mission {
  id: string;
  slug: string;
  title: string;
  description: string;
  objectiveType: MissionObjective;
  target: number;
  progress: number;
  rewardCoins: number;
  xpReward: number;
  frequency: MissionFrequency;
  periodKey: string;
  periodEndsAt: string | null;
  claimed: boolean;
  claimedAt: string | null;
  /** End of a scheduled mission's window, if it has one. */
  availableUntil: string | null;
}

export interface MissionsResponse extends VirtualAmount {
  missions: Mission[];
}

export interface ClaimResponse extends VirtualAmount, ProgressDelta {
  success: true;
  duplicate: boolean;
  transactionId: string;
  taskId: string;
  rewardCoins: number;
  xpReward: number;
  balanceCoins: number;
}

export type AchievementMetric = "total_taps" | "total_coins_earned" | "missions_completed" | "level" | "longest_streak";

export interface Achievement {
  slug: string;
  title: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  threshold: number;
  progress: number;
  rewardCoins: number;
  xpReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface Progression {
  xpTotal: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  totalTaps: number;
  totalCoinsEarned: number;
  missionsCompleted: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  nextAchievement: Achievement | null;
}

export interface AchievementsResponse {
  achievements: Achievement[];
  progression: Progression;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  series: RewardSeriesPoint[];
  progression: Progression;
}

export const API_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "VALIDATION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "NOT_FOUND",
  "COOLDOWN_ACTIVE",
  "DAILY_LIMIT_REACHED",
  "IDEMPOTENCY_CONFLICT",
  "ALREADY_CLAIMED",
  "MISSION_INCOMPLETE",
  "ALREADY_EXISTS",
  "INSUFFICIENT_BALANCE",
  "ACTION_NOT_ALLOWED",
  "LEVEL_REQUIRED",
  "ALREADY_OWNED",
  "NOTHING_TO_COLLECT",
  "FEATURE_DISABLED",
  "MAINTENANCE_MODE",
  "FORBIDDEN",
  "ACCOUNT_SUSPENDED",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
}

/** GET /api/auth/session: a flag only, never the user's identity. */
export interface SessionStatus {
  authenticated: boolean;
}
