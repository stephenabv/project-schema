import { z } from "zod";
import { progressDeltaSchema } from "./progression";

const count = z.coerce.number().int().nonnegative();
const positive = z.coerce.number().int().positive();

export const ROBOT_TIERS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type RobotTier = (typeof ROBOT_TIERS)[number];

/** Illustration keys the database accepts (robots.image_key). */
export const ROBOT_IMAGE_KEYS = ["scout", "worker", "forge", "titan", "nova", "drone", "mech"] as const;
export type RobotImageKey = (typeof ROBOT_IMAGE_KEYS)[number];

export const ROBOT_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export type RobotListingStatus = (typeof ROBOT_STATUSES)[number];

export const TIER_LABELS: Record<RobotTier, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const robotIdSchema = z.uuid("Unknown robot");

export const robotActiveRequestSchema = z.strictObject({ active: z.boolean(), idempotencyKey: z.uuid() });

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens")
  .min(3, "Use at least 3 characters")
  .max(48, "Use at most 48 characters");
const whole = (min: number, max: number) =>
  z.coerce.number().int("Use a whole number").min(min, `At least ${min.toLocaleString("en-US")}`).max(max, `At most ${max.toLocaleString("en-US")}`);

/** Bounds mirror public.ve_admin_save_robot. */
export const robotInputSchema = z.strictObject({
  slug,
  name: z.string().trim().min(2, "Use at least 2 characters").max(40, "Use at most 40 characters"),
  description: z.string().trim().max(200, "Use at most 200 characters"),
  tier: z.enum(ROBOT_TIERS, "Choose a tier"),
  imageKey: z.enum(ROBOT_IMAGE_KEYS, "Choose an illustration"),
  priceCoins: whole(1, 1_000_000_000),
  coinsPerHour: whole(1, 1_000_000),
  maxPerUser: whole(1, 100),
  levelRequired: whole(1, 1000),
  status: z.enum(ROBOT_STATUSES, "Choose a status"),
  sortOrder: whole(-100_000, 100_000),
});
export type RobotInput = z.infer<typeof robotInputSchema>;

export const robotPolicyInputSchema = z
  .strictObject({
    maxOwned: whole(1, 500),
    maxActive: whole(1, 100),
    accrualCapHours: whole(1, 168),
  })
  .refine((p) => p.maxActive <= p.maxOwned, { message: "Cannot exceed the owned limit", path: ["maxActive"] });
export type RobotPolicyInput = z.infer<typeof robotPolicyInputSchema>;

// ---------------------------------------------------------------------------
// Results (database contracts)
// ---------------------------------------------------------------------------

export const robotPolicySchema = z.object({ maxOwned: positive, maxActive: positive, accrualCapHours: positive });
export type RobotPolicy = z.infer<typeof robotPolicySchema>;

export const ROBOT_BLOCKERS = ["unlisted", "robot_limit", "total_limit", "level"] as const;

export const shopRobotSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  tier: z.enum(ROBOT_TIERS),
  imageKey: z.enum(ROBOT_IMAGE_KEYS),
  priceCoins: positive,
  coinsPerHour: positive,
  coinsPer24h: positive,
  maxPerUser: positive,
  levelRequired: positive,
  ownedCount: count,
  activeCount: count,
  status: z.enum(["available", "owned", "active"]),
  blocker: z.enum(ROBOT_BLOCKERS).nullable(),
});
export type ShopRobot = z.infer<typeof shopRobotSchema>;

export const robotShopSchema = z.object({
  balanceCoins: count,
  level: positive,
  ownedCount: count,
  activeCount: count,
  maxOwned: positive,
  maxActive: positive,
  accrualCapHours: positive,
  robots: z.array(shopRobotSchema),
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type RobotShop = z.infer<typeof robotShopSchema>;

export const ownedRobotSchema = z.object({
  id: z.uuid(),
  robotId: z.uuid(),
  name: z.string(),
  tier: z.enum(ROBOT_TIERS),
  imageKey: z.enum(ROBOT_IMAGE_KEYS),
  coinsPerHour: positive,
  isActive: z.boolean(),
  earningSince: z.string().nullable(),
  pendingCoins: count,
  fullAt: z.string().nullable(),
  totalEarnedCoins: count,
  purchasedAt: z.string(),
  pricePaidCoins: positive,
  recentEarnings: z.array(
    z.object({
      coins: positive,
      periodStart: z.string(),
      periodEnd: z.string(),
      reason: z.enum(["collect", "deactivate"]),
    }),
  ),
});
export type OwnedRobot = z.infer<typeof ownedRobotSchema>;

export const robotGeneratorSchema = z.object({
  serverTime: z.string(),
  maxActive: positive,
  maxOwned: positive,
  accrualCapHours: positive,
  robots: z.array(ownedRobotSchema),
  totals: z.object({
    ownedCount: count,
    activeCount: count,
    coinsPerHour: count,
    pendingCoins: count,
    totalEarnedCoins: count,
    earnedTodayCoins: count,
  }),
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type RobotGenerator = z.infer<typeof robotGeneratorSchema>;

export const robotPurchaseResultSchema = z.object({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  robotId: z.uuid(),
  userRobotId: z.uuid(),
  activated: z.boolean(),
  priceCoins: positive,
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type RobotPurchaseResult = z.infer<typeof robotPurchaseResultSchema>;

export const robotCollectResultSchema = progressDeltaSchema.extend({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  collectedCoins: positive,
  robotsPaid: count,
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type RobotCollectResult = z.infer<typeof robotCollectResultSchema>;

export const robotToggleResultSchema = z.object({
  success: z.literal(true),
  userRobotId: z.uuid(),
  isActive: z.boolean(),
  paidCoins: count,
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type RobotToggleResult = z.infer<typeof robotToggleResultSchema>;

export const adminRobotSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  tier: z.enum(ROBOT_TIERS),
  imageKey: z.enum(ROBOT_IMAGE_KEYS),
  priceCoins: positive,
  coinsPerHour: positive,
  maxPerUser: positive,
  levelRequired: positive,
  status: z.enum(ROBOT_STATUSES),
  sortOrder: z.coerce.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  unitsOwned: count,
  unitsActive: count,
  owners: count,
  totalEarnedCoins: count,
});
export type AdminRobot = z.infer<typeof adminRobotSchema>;

export const adminRobotsSchema = z.object({ robots: z.array(adminRobotSchema), policy: robotPolicySchema });

export const robotActivitySchema = z.object({
  purchases: z.array(
    z.object({
      userRobotId: z.uuid(),
      userId: z.uuid(),
      username: z.string(),
      robotName: z.string(),
      priceCoins: positive,
      coinsPerHour: positive,
      isActive: z.boolean(),
      totalEarnedCoins: count,
      purchasedAt: z.string(),
      transactionId: z.uuid(),
    }),
  ),
  earnings: z.array(
    z.object({
      id: z.uuid(),
      userId: z.uuid(),
      username: z.string(),
      robotName: z.string(),
      coins: positive,
      periodStart: z.string(),
      periodEnd: z.string(),
      reason: z.enum(["collect", "deactivate"]),
      transactionId: z.uuid(),
      createdAt: z.string(),
    }),
  ),
});
export type RobotActivity = z.infer<typeof robotActivitySchema>;

/** Hourly rate as VC per minute, for display (two decimals). */
export function coinsPerMinute(coinsPerHour: number): number {
  return Math.round((coinsPerHour / 60) * 100) / 100;
}

/** Hours until a robot pays back its price at its rate. */
export function paybackHours(priceCoins: number, coinsPerHour: number): number {
  return Math.ceil(priceCoins / coinsPerHour);
}
