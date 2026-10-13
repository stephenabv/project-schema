import { z } from "zod";
import { progressDeltaSchema } from "./progression";

const count = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const idempotentRequestSchema = z.strictObject({ idempotencyKey: z.uuid() });

export const shopItemIdSchema = z.uuid("Unknown item");

export const equipRequestSchema = z.strictObject({ equip: z.boolean() });

export const LEADERBOARDS = ["xp", "weekly"] as const;
export type LeaderboardKind = (typeof LEADERBOARDS)[number];

export const LEADERBOARD_LABELS: Record<LeaderboardKind, string> = {
  xp: "All-time XP",
  weekly: "This week's coins",
};

/** Unknown values fall back to the all-time board instead of failing. */
export const leaderboardQuerySchema = z.enum(LEADERBOARDS).catch("xp");

export const MAX_NOTIFICATION_IDS = 100;

/** Omit `ids` to mark everything read. */
export const markReadRequestSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(MAX_NOTIFICATION_IDS).optional(),
});

export const leaderboardOptOutSchema = z.boolean();

// ---------------------------------------------------------------------------
// Results (database contracts)
// ---------------------------------------------------------------------------

export const dailyBonusStatusSchema = z.object({
  claimedToday: z.boolean(),
  currentStreak: count,
  longestStreak: count,
  nextRewardCoins: z.number().int().positive(),
  xpReward: count,
  resetsAt: z.string(),
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type DailyBonusStatus = z.infer<typeof dailyBonusStatusSchema>;

export const dailyBonusClaimSchema = progressDeltaSchema.extend({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  rewardCoins: z.number().int().positive(),
  xpReward: count,
  currentStreak: count,
  longestStreak: count,
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type DailyBonusClaim = z.infer<typeof dailyBonusClaimSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  username: z.string(),
  avatarKey: z.string(),
  level: z.number().int().positive(),
  score: count,
  title: z.string().nullable(),
  frame: z.string().nullable(),
  isYou: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardSchema = z.object({
  board: z.enum(LEADERBOARDS),
  entries: z.array(leaderboardEntrySchema),
  you: z.object({
    rank: z.number().int().positive().nullable(),
    score: count,
    optedOut: z.boolean(),
  }),
  weekStartsOn: z.iso.date(),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

export const SHOP_CATEGORIES = ["tap_skin", "avatar_frame", "title"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const shopItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(SHOP_CATEGORIES),
  styleKey: z.string(),
  priceCoins: z.number().int().positive(),
  levelRequired: z.number().int().positive(),
  owned: z.boolean(),
  equipped: z.boolean(),
});
export type ShopItem = z.infer<typeof shopItemSchema>;

export const shopSchema = z.object({
  balanceCoins: count,
  level: z.number().int().positive(),
  items: z.array(shopItemSchema),
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type Shop = z.infer<typeof shopSchema>;

export const equippedCosmeticsSchema = z.object({
  tapSkin: z.string().nullable(),
  avatarFrame: z.string().nullable(),
  title: z.string().nullable(),
});
export type EquippedCosmetics = z.infer<typeof equippedCosmeticsSchema>;

export const purchaseResultSchema = z.object({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  itemId: z.uuid(),
  priceCoins: z.number().int().positive(),
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type PurchaseResult = z.infer<typeof purchaseResultSchema>;

/** Mirrors the ve_notifications.link check: only same-site paths become links. */
const internalPath = z
  .string()
  .regex(/^\/(?!\/)[a-z0-9/_-]*$/)
  .max(64)
  .nullable()
  .catch(null);

export const NOTIFICATION_KINDS = ["badge", "level", "bonus", "shop", "account", "wallet"] as const;

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string(),
  body: z.string(),
  link: internalPath,
  createdAt: z.string(),
  read: z.boolean(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unread: count,
});
export type NotificationList = z.infer<typeof notificationListSchema>;
