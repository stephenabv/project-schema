import { z } from "zod";
import { progressDeltaSchema } from "./progression";

/** The client names a mission and sends an idempotency key; the server decides eligibility and reward. */
export const claimRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
});

export const taskIdSchema = z.uuid("Unknown mission");

const count = z.number().int().nonnegative();

export const missionSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  objectiveType: z.enum(["taps", "missions"]),
  target: z.number().int().positive(),
  progress: count,
  rewardCoins: z.number().int().positive(),
  xpReward: count,
  frequency: z.enum(["daily", "weekly", "once"]),
  periodKey: z.string(),
  periodEndsAt: z.string().nullable(),
  claimed: z.boolean(),
  claimedAt: z.string().nullable(),
  availableUntil: z.string().nullable().default(null),
});

export const claimResultSchema = progressDeltaSchema.extend({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  taskId: z.uuid(),
  rewardCoins: z.number().int().positive(),
  xpReward: count,
  balanceCoins: count,
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
