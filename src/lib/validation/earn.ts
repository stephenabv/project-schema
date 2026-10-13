import { z } from "zod";
import { progressDeltaSchema } from "./progression";

/** The client sends only an idempotency key; the server decides the reward. */
export const tapRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
});

export type TapRequest = z.infer<typeof tapRequestSchema>;

/** Validates the JSON returned by public.process_tap(). */
export const tapResultSchema = progressDeltaSchema.extend({
  success: z.literal(true),
  duplicate: z.boolean(),
  transactionId: z.uuid(),
  rewardCoins: z.number().int(),
  balanceCoins: z.number().int().nonnegative(),
  tapsToday: z.number().int().nonnegative(),
  xpEarned: z.number().int().nonnegative(),
  currency: z.literal("VC"),
  redeemable: z.literal(false),
});
