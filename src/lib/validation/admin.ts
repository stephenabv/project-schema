import { z } from "zod";
import { BADGE_ICON_KEYS } from "@/lib/progression/badge-icons";
import { featureFlagsSchema, maintenanceSchema } from "./operations";
import { ACHIEVEMENT_METRICS } from "./progression";

const count = z.number().int().nonnegative();
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens")
  .min(3, "Use at least 3 characters")
  .max(48, "Use at most 48 characters");
const title = z.string().trim().min(3, "Use at least 3 characters").max(80, "Use at most 80 characters");
const description = z.string().trim().max(280, "Use at most 280 characters");
export const reasonSchema = z.string().trim().min(3, "Give a reason of at least 3 characters").max(280, "Use at most 280 characters");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ["draft", "published", "archived"] as const;
export const TASK_FREQUENCIES = ["daily", "weekly", "once"] as const;
export const TASK_OBJECTIVES = ["taps", "missions"] as const;

export const taskInputSchema = z.strictObject({
  slug,
  title,
  description,
  objectiveType: z.enum(TASK_OBJECTIVES),
  target: z.coerce.number().int("Use a whole number").min(1).max(1_000_000),
  rewardCoins: z.coerce.number().int("Use a whole number").min(1).max(1_000_000),
  xpReward: z.coerce.number().int("Use a whole number").min(0).max(1_000_000),
  frequency: z.enum(TASK_FREQUENCIES),
  status: z.enum(TASK_STATUSES),
  sortOrder: z.coerce.number().int("Use a whole number").min(-100_000).max(100_000),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const achievementInputSchema = z.strictObject({
  slug,
  title,
  description,
  metric: z.enum(ACHIEVEMENT_METRICS),
  threshold: z.coerce.number().int("Use a whole number").min(1).max(1_000_000_000),
  rewardCoins: z.coerce.number().int("Use a whole number").min(0).max(1_000_000),
  xpReward: z.coerce.number().int("Use a whole number").min(0).max(1_000_000),
  icon: z.enum(BADGE_ICON_KEYS, "Choose one of the icons"),
  sortOrder: z.coerce.number().int("Use a whole number").min(-100_000).max(100_000),
  isActive: z.boolean(),
});
export type AchievementInput = z.infer<typeof achievementInputSchema>;

/** Bounds mirror public.ve_admin_update_tap_policy. */
export const tapPolicyInputSchema = z.strictObject({
  rewardCoins: z.coerce.number().int("Use a whole number").min(1).max(1000),
  cooldownMs: z.coerce.number().int("Use a whole number").min(250, "At least 250 ms").max(60_000),
  dailyLimit: z.coerce.number().int("Use a whole number").min(1).max(100_000),
  xpPerTap: z.coerce.number().int("Use a whole number").min(0).max(100),
});
export type TapPolicyInput = z.infer<typeof tapPolicyInputSchema>;

export const userActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("suspend"), reason: reasonSchema }),
  z.strictObject({ action: z.literal("restore") }),
  z.strictObject({ action: z.literal("set_role"), role: z.enum(["user", "admin"]) }),
]);
export type UserAction = z.infer<typeof userActionSchema>;

export const adjustmentInputSchema = z.strictObject({
  amountCoins: z.coerce
    .number()
    .int("Use a whole number")
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, "Enter a non-zero amount"),
  reason: reasonSchema,
  idempotencyKey: z.uuid(),
});
export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;

export const userQuerySchema = z.object({
  q: z.string().trim().max(254).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(4000).catch(1),
});

const isoDate = z.iso.date();
export const auditQuerySchema = z.object({
  action: z
    .string()
    .trim()
    .regex(/^[a-z_.]{0,64}$/)
    .optional()
    .catch(undefined),
  target: z.string().trim().max(64).optional().catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  cursor: z.string().max(200).optional().catch(undefined),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

// ---------------------------------------------------------------------------
// Results (database contracts)
// ---------------------------------------------------------------------------

export const accountStatusSchema = z.object({
  isAdmin: z.boolean(),
  suspended: z.boolean(),
  suspendedAt: z.string().nullable(),
  suspensionReason: z.string().nullable(),
});
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const adminOverviewSchema = z.object({
  totalPlayers: count,
  newPlayersToday: count,
  activeToday: count,
  tapsToday: count,
  coinsIssuedToday: count,
  missionsClaimedToday: count,
  duplicateRequestsToday: count,
  coinsInCirculation: count,
  suspendedPlayers: count,
  admins: count,
  publishedMissions: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export const activitySeriesSchema = z.array(
  z
    .object({
      day: isoDate,
      active_players: z.coerce.number().int().nonnegative(),
      new_players: z.coerce.number().int().nonnegative(),
      taps: z.coerce.number().int().nonnegative(),
      coins_issued: z.coerce.number().int().nonnegative(),
      missions_claimed: z.coerce.number().int().nonnegative(),
      duplicate_requests: z.coerce.number().int().nonnegative(),
    })
    .transform((row) => ({
      day: row.day,
      activePlayers: row.active_players,
      newPlayers: row.new_players,
      taps: row.taps,
      coinsIssued: row.coins_issued,
      missionsClaimed: row.missions_claimed,
      duplicateRequests: row.duplicate_requests,
    })),
);
export type ActivityPoint = z.infer<typeof activitySeriesSchema>[number];

export const suspiciousRowSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  duplicateRequests: count,
  daysAtLimit: count,
  taps: count,
  lastActiveOn: isoDate,
  suspended: z.boolean(),
});
export type SuspiciousRow = z.infer<typeof suspiciousRowSchema>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  balanceCoins: count,
  xpTotal: count,
  level: z.number().int().positive(),
  totalTaps: count,
  missionsCompleted: count,
  suspendedAt: z.string().nullable(),
  suspensionReason: z.string().nullable(),
  createdAt: z.string(),
  lastActiveOn: isoDate.nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserPageSchema = z.object({ items: z.array(adminUserSchema), total: count });
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

export const suspensionResultSchema = z.object({
  userId: z.uuid(),
  suspendedAt: z.string().nullable(),
  suspensionReason: z.string().nullable(),
});

export const roleResultSchema = z.object({ userId: z.uuid(), role: z.enum(["user", "admin"]) });

export const adjustmentResultSchema = z.object({
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  userId: z.uuid(),
  amountCoins: z.number().int(),
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type AdjustmentResult = z.infer<typeof adjustmentResultSchema>;

export const adminTaskSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  objectiveType: z.enum(TASK_OBJECTIVES),
  target: z.number().int().positive(),
  rewardCoins: z.number().int().positive(),
  xpReward: count,
  frequency: z.enum(TASK_FREQUENCIES),
  status: z.enum(TASK_STATUSES),
  sortOrder: z.number().int(),
  publishAt: z.string().nullable().default(null),
  unpublishAt: z.string().nullable().default(null),
  live: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  claimsTotal: count,
  claimsLast7Days: count,
});
export type AdminTask = z.infer<typeof adminTaskSchema>;

export const adminAchievementSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  metric: z.enum(ACHIEVEMENT_METRICS),
  threshold: z.number().int().positive(),
  rewardCoins: count,
  xpReward: count,
  icon: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  unlockedCount: count,
});
export type AdminAchievement = z.infer<typeof adminAchievementSchema>;

const tapPolicySchema = z.object({
  rewardCoins: z.number().int().positive(),
  cooldownMs: count,
  dailyLimit: z.number().int().positive(),
  xpPerTap: count,
});

export const adminSettingsSchema = z.object({
  tapPolicy: tapPolicySchema,
  tapPolicyUpdatedAt: z.string().nullable(),
  tapPolicyUpdatedBy: z.string().nullable(),
  featureFlags: featureFlagsSchema,
  maintenance: maintenanceSchema,
});
export type AdminSettings = z.infer<typeof adminSettingsSchema>;
export { tapPolicySchema };

export const auditEntrySchema = z.object({
  id: z.uuid(),
  actorId: z.uuid().nullable(),
  actorUsername: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageResultSchema = z.object({ items: z.array(auditEntrySchema), hasMore: z.boolean() });

export interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
}
