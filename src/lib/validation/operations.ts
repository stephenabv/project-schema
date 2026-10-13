import { z } from "zod";
import { progressDeltaSchema } from "./progression";

const count = z.number().int().nonnegative();

// ---------------------------------------------------------------------------
// Feature flags and maintenance mode
// ---------------------------------------------------------------------------

export const FEATURE_FLAGS = ["dailyBonus", "leaderboard", "shop", "idleGenerator"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const FEATURE_LABELS: Record<FeatureFlag, string> = {
  dailyBonus: "Daily bonus",
  leaderboard: "Leaderboards",
  shop: "Cosmetic shop",
  idleGenerator: "Idle generator",
};

export const featureFlagsSchema = z.object({
  dailyBonus: z.boolean(),
  leaderboard: z.boolean(),
  shop: z.boolean(),
  idleGenerator: z.boolean(),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const maintenanceSchema = z.object({ enabled: z.boolean(), message: z.string() });
export type MaintenanceStatus = z.infer<typeof maintenanceSchema>;

export const appConfigSchema = z.object({ flags: featureFlagsSchema, maintenance: maintenanceSchema });
export type AppConfig = z.infer<typeof appConfigSchema>;

/** Used when the configuration cannot be read: everything on, no maintenance banner. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  flags: { dailyBonus: true, leaderboard: true, shop: true, idleGenerator: true },
  maintenance: { enabled: false, message: "" },
};

export const maintenanceInputSchema = z.strictObject({
  enabled: z.boolean(),
  message: z.string().trim().max(200, "Use at most 200 characters"),
});
export type MaintenanceInput = z.infer<typeof maintenanceInputSchema>;

// ---------------------------------------------------------------------------
// Idle generator
// ---------------------------------------------------------------------------

export const generatorStatusSchema = z.object({
  level: count,
  maxLevel: z.number().int().positive(),
  coinsPerHour: count,
  capHours: z.number().int().positive(),
  pendingCoins: count,
  lastCollectedAt: z.string().nullable(),
  fullAt: z.string().nullable(),
  nextUpgradeCost: z.number().int().positive().nullable(),
  nextCoinsPerHour: z.number().int().positive().nullable(),
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type GeneratorStatus = z.infer<typeof generatorStatusSchema>;

export const collectResultSchema = progressDeltaSchema.extend({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  collectedCoins: z.number().int().positive(),
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type CollectResult = z.infer<typeof collectResultSchema>;

export const upgradeResultSchema = z.object({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  generatorLevel: z.number().int().positive(),
  costCoins: z.number().int().positive(),
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
export type UpgradeResult = z.infer<typeof upgradeResultSchema>;

// ---------------------------------------------------------------------------
// Scheduled publishing
// ---------------------------------------------------------------------------

/** `datetime-local` form values are interpreted as UTC; empty means "no limit". */
const utcDateTime = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Use a valid date and time" });
      return z.NEVER;
    }
    const date = new Date(`${value}${value.length === 16 ? ":00" : ""}Z`);
    // Rejects impossible dates such as 31 February, which Date rolls over.
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 16) !== value.slice(0, 16)) {
      ctx.addIssue({ code: "custom", message: "Use a valid date and time" });
      return z.NEVER;
    }
    return date.toISOString();
  });

export const scheduleInputSchema = z
  .strictObject({ publishAt: utcDateTime, unpublishAt: utcDateTime })
  .refine((v) => !v.publishAt || !v.unpublishAt || v.unpublishAt > v.publishAt, {
    message: "The end must be after the start",
    path: ["unpublishAt"],
  });
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/** ISO timestamp -> `YYYY-MM-DDTHH:mm` (UTC) for a datetime-local input. */
export function toUtcInputValue(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16) : "";
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

const coins = z.coerce.number().int();

export const economySeriesSchema = z.array(
  z.object({
    day: z.iso.date(),
    tapCoins: coins,
    missionCoins: coins,
    badgeCoins: coins,
    bonusCoins: coins,
    idleCoins: coins,
    spentCoins: coins,
    adjustmentCoins: coins,
  }),
);
export type EconomyPoint = z.infer<typeof economySeriesSchema>[number];

export const retentionSchema = z.array(
  z.object({
    weekStart: z.iso.date(),
    players: z.coerce.number().int().nonnegative(),
    day1Active: z.coerce.number().int().nonnegative(),
    week2Active: z.coerce.number().int().nonnegative(),
  }),
);
export type RetentionCohort = z.infer<typeof retentionSchema>[number];

export const engagementSummarySchema = z.object({
  bonusClaimsToday: count,
  activeStreaks: count,
  longestStreak: count,
  itemsOwned: count,
  generators: count,
  averageGeneratorLevel: z.coerce.number().nonnegative(),
  leaderboardOptOuts: count,
  topItems: z.array(z.object({ name: z.string(), owners: z.coerce.number().int().nonnegative() })),
});
export type EngagementSummary = z.infer<typeof engagementSummarySchema>;

export const EXPORT_DATASETS = ["users", "audit-logs", "economy"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];
