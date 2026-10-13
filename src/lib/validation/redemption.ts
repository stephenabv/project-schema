import { z } from "zod";
import { parsePesosToCentavos } from "@/lib/formatting/money";

const count = z.coerce.number().int().nonnegative();
const positive = z.coerce.number().int().positive();

export const CONVERSION_STATUSES = ["pending", "under_review", "approved", "rejected", "cancelled", "completed"] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

export const PAYOUT_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "processing",
  "paid",
  "rejected",
  "failed",
  "refunded",
  "cancelled",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Admin transitions each status allows (mirrors the database). */
export const CONVERSION_TRANSITIONS: Record<ConversionStatus, readonly ConversionStatus[]> = {
  pending: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["completed", "rejected"],
  rejected: [],
  cancelled: [],
  completed: [],
};

export const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  pending: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["processing", "rejected"],
  processing: ["paid", "failed"],
  paid: ["refunded"],
  rejected: [],
  failed: [],
  refunded: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<ConversionStatus | PayoutStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  approved: "Approved",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  failed: "Failed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  completed: "Completed",
};

// ---------------------------------------------------------------------------
// Player inputs
// ---------------------------------------------------------------------------

export const conversionRequestSchema = z.strictObject({
  coins: z.number().int("Use a whole number of VC").positive("Enter an amount").max(1_000_000_000),
  rateId: z.uuid(),
  idempotencyKey: z.uuid(),
});
export type ConversionRequest = z.infer<typeof conversionRequestSchema>;

/**
 * Account details are validated here in plain text, then encrypted on the
 * server before they reach the database.
 */
export const payoutRequestSchema = z.strictObject({
  methodId: z.uuid("Choose a payout method"),
  amountCentavos: z.number().int().positive("Enter an amount").max(100_000_000),
  accountName: z
    .string()
    .trim()
    .min(2, "Enter the account holder's name")
    .max(80, "Use at most 80 characters")
    .regex(/^[\p{L}\p{M} .,'-]+$/u, "Use letters, spaces and . , ' - only"),
  accountNumber: z
    .string()
    .trim()
    .min(4, "Enter the account number")
    .max(64, "Use at most 64 characters")
    .regex(/^[A-Za-z0-9 -]+$/, "Use letters, numbers, spaces and hyphens only"),
  idempotencyKey: z.uuid(),
});
export type PayoutRequest = z.infer<typeof payoutRequestSchema>;

export const requestIdSchema = z.uuid("Unknown request");

// ---------------------------------------------------------------------------
// Admin inputs
// ---------------------------------------------------------------------------

const reason = z.string().trim().min(3, "Give a reason of at least 3 characters").max(280, "Use at most 280 characters");
const note = z.string().trim().max(500, "Use at most 500 characters");
const pesos = (label: string) =>
  z.string().transform((value, ctx) => {
    const centavos = parsePesosToCentavos(value);
    if (centavos === null || centavos < 1) {
      ctx.addIssue({ code: "custom", message: `Enter ${label} like 10.00` });
      return z.NEVER;
    }
    return centavos;
  });
const whole = (min: number, max: number) =>
  z.coerce.number().int("Use a whole number").min(min, `At least ${min.toLocaleString("en-US")}`).max(max, `At most ${max.toLocaleString("en-US")}`);

/** "rateCoins VC = rateCentavos". Bounds mirror ve_admin_set_exchange_rate. */
export const exchangeRateInputSchema = z
  .strictObject({
    rateCoins: whole(1, 1_000_000_000),
    ratePesos: pesos("a peso amount"),
    effectiveAt: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === "") return null;
        const date = new Date(`${value}${value.length === 16 ? ":00" : ""}Z`);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) || Number.isNaN(date.getTime())) {
          ctx.addIssue({ code: "custom", message: "Use a valid date and time" });
          return z.NEVER;
        }
        return date.toISOString();
      }),
    reason,
    confirmLargeChange: z.boolean(),
  })
  .refine((v) => v.ratePesos <= v.rateCoins * 100, {
    message: "A rate above ₱1.00 per VC is not allowed",
    path: ["ratePesos"],
  });
export type ExchangeRateInput = z.infer<typeof exchangeRateInputSchema>;

export const ENABLE_CONFIRMATION = "ENABLE REDEMPTION";

export const redemptionPolicyInputSchema = z
  .strictObject({
    enabled: z.boolean(),
    minConversionCoins: whole(1, 1_000_000_000),
    maxConversionCoins: whole(1, 1_000_000_000),
    minPayoutPesos: pesos("a minimum"),
    maxPayoutPesos: pesos("a maximum"),
    processingDays: whole(1, 60),
    reason,
    confirmation: z.string().trim(),
  })
  .refine((p) => p.minConversionCoins <= p.maxConversionCoins, {
    message: "Cannot exceed the maximum",
    path: ["minConversionCoins"],
  })
  .refine((p) => p.minPayoutPesos >= 100 && p.maxPayoutPesos <= 100_000_000, {
    message: "Use between ₱1.00 and ₱1,000,000.00",
    path: ["minPayoutPesos"],
  })
  .refine((p) => p.minPayoutPesos <= p.maxPayoutPesos, { message: "Cannot exceed the maximum", path: ["minPayoutPesos"] });
export type RedemptionPolicyInput = z.infer<typeof redemptionPolicyInputSchema>;

export const payoutMethodInputSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,32}$/, "Use 2 to 32 lowercase letters, numbers or underscores"),
  name: z.string().trim().min(2, "Use at least 2 characters").max(40, "Use at most 40 characters"),
  accountLabel: z.string().trim().min(2, "Use at least 2 characters").max(60, "Use at most 60 characters"),
  isActive: z.boolean(),
  sortOrder: whole(-100_000, 100_000),
});
export type PayoutMethodInput = z.infer<typeof payoutMethodInputSchema>;

export const conversionTransitionSchema = z
  .strictObject({
    to: z.enum(["under_review", "approved", "rejected", "completed"]),
    note,
    reason: z.string().trim().max(280),
  })
  .refine((t) => t.to !== "rejected" || t.reason.length >= 3, {
    message: "Give a rejection reason of at least 3 characters",
    path: ["reason"],
  });
export type ConversionTransition = z.infer<typeof conversionTransitionSchema>;

export const payoutTransitionSchema = z
  .strictObject({
    to: z.enum(["under_review", "approved", "processing", "paid", "rejected", "failed", "refunded"]),
    note,
    reason: z.string().trim().max(280),
    paymentReference: z.string().trim().max(100),
    verified: z.boolean(),
  })
  .refine((t) => !["rejected", "failed", "refunded"].includes(t.to) || t.reason.length >= 3, {
    message: "Give a reason of at least 3 characters",
    path: ["reason"],
  })
  .refine((t) => t.to !== "paid" || t.paymentReference.length >= 3, {
    message: "Enter the payment reference from the payment channel",
    path: ["paymentReference"],
  })
  .refine((t) => t.to !== "paid" || t.verified, {
    message: "Confirm that you verified the payment was completed",
    path: ["verified"],
  });
export type PayoutTransition = z.infer<typeof payoutTransitionSchema>;

export const conversionQuerySchema = z.object({
  status: z.enum([...CONVERSION_STATUSES, "open"]).optional().catch(undefined),
  q: z.string().trim().max(64).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(4000).catch(1),
});

export const payoutQuerySchema = z.object({
  status: z.enum([...PAYOUT_STATUSES, "open"]).optional().catch(undefined),
  q: z.string().trim().max(64).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(4000).catch(1),
});

// ---------------------------------------------------------------------------
// Results (database contracts)
// ---------------------------------------------------------------------------

export const redemptionPolicySchema = z.object({
  enabled: z.boolean(),
  minConversionCoins: positive,
  maxConversionCoins: positive,
  minPayoutCentavos: positive,
  maxPayoutCentavos: positive,
  processingDays: positive,
});
export type RedemptionPolicy = z.infer<typeof redemptionPolicySchema>;

export const exchangeRateSchema = z.object({
  id: z.uuid(),
  rateCoins: positive,
  rateCentavos: positive,
  effectiveAt: z.string(),
  reason: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

export const payoutMethodSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  accountLabel: z.string(),
});
export type PayoutMethod = z.infer<typeof payoutMethodSchema>;

export const adminPayoutMethodSchema = payoutMethodSchema.extend({ isActive: z.boolean(), sortOrder: z.coerce.number().int() });
export type AdminPayoutMethod = z.infer<typeof adminPayoutMethodSchema>;

export const redemptionOverviewSchema = z.object({
  enabled: z.boolean(),
  policy: redemptionPolicySchema.omit({ enabled: true }),
  rate: exchangeRateSchema.nullable(),
  coins: z.object({ availableCoins: count, reservedCoins: count, eligibleCoins: count }),
  php: z.object({ availableCentavos: count, reservedCentavos: count, paidCentavos: count }),
  openConversions: count,
  openPayouts: count,
  methods: z.array(payoutMethodSchema),
});
export type RedemptionOverview = z.infer<typeof redemptionOverviewSchema>;

const eventSchema = z.object({
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export const conversionSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  coins: positive,
  rateCoins: positive,
  rateCentavos: positive,
  phpCentavos: positive,
  status: z.enum(CONVERSION_STATUSES),
  reviewNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  events: z.array(eventSchema),
  duplicate: z.boolean().optional(),
});
export type Conversion = z.infer<typeof conversionSchema>;

export const adminConversionSchema = conversionSchema.extend({
  userId: z.uuid(),
  username: z.string(),
  rateId: z.uuid(),
  holdTransactionId: z.uuid(),
  releaseTransactionId: z.uuid().nullable(),
  reviewedBy: z.string().nullable(),
});
export type AdminConversion = z.infer<typeof adminConversionSchema>;

export const payoutSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  amountCentavos: positive,
  status: z.enum(PAYOUT_STATUSES),
  methodCode: z.string(),
  methodName: z.string(),
  accountHint: z.string(),
  reviewNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  paymentReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  paidAt: z.string().nullable(),
  events: z.array(eventSchema),
  duplicate: z.boolean().optional(),
});
export type Payout = z.infer<typeof payoutSchema>;

export const adminPayoutSchema = payoutSchema.extend({
  userId: z.uuid(),
  username: z.string(),
  reviewedBy: z.string().nullable(),
});
export type AdminPayout = z.infer<typeof adminPayoutSchema>;

export const adminPayoutDetailSchema = adminPayoutSchema.extend({ accountDetails: z.string() });

export const adminConversionPageSchema = z.object({ items: z.array(adminConversionSchema), total: count });
export const adminPayoutPageSchema = z.object({ items: z.array(adminPayoutSchema), total: count });

export const adminRedemptionSchema = z.object({
  policy: redemptionPolicySchema,
  policyUpdatedAt: z.string().nullable(),
  policyUpdatedBy: z.string().nullable(),
  currentRate: exchangeRateSchema.nullable(),
  rates: z.array(exchangeRateSchema),
  methods: z.array(adminPayoutMethodSchema),
});
export type AdminRedemption = z.infer<typeof adminRedemptionSchema>;

const statusTotals = z.record(
  z.string(),
  z.object({ count, coins: count.optional(), phpCentavos: count.optional(), amountCentavos: count.optional() }),
);

export const financeOverviewSchema = z.object({
  redemptionEnabled: z.boolean(),
  currentRate: exchangeRateSchema.nullable(),
  conversions: statusTotals,
  payouts: statusTotals,
  reservedCoins: count,
  availableCentavos: count,
  reservedCentavos: count,
  paidCentavos: count,
  robotCoinsToday: count,
  tapCoinsToday: count,
});
export type FinanceOverview = z.infer<typeof financeOverviewSchema>;

export const ledgerIssueSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  balanceCoins: z.coerce.number().int(),
  ledgerCoins: z.coerce.number().int(),
  reservedCoins: z.coerce.number().int(),
  openConversionCoins: z.coerce.number().int(),
  availableCentavos: z.coerce.number().int(),
  ledgerAvailableCentavos: z.coerce.number().int(),
  reservedCentavos: z.coerce.number().int(),
  ledgerReservedCentavos: z.coerce.number().int(),
  openPayoutCentavos: z.coerce.number().int(),
  paidCentavos: z.coerce.number().int(),
  ledgerPaidCentavos: z.coerce.number().int(),
});
export type LedgerIssue = z.infer<typeof ledgerIssueSchema>;

export const earningsBreakdownSchema = z.object({
  tapCoins: count,
  tapCoinsToday: count,
  robotCoins: count,
  robotCoinsToday: count,
  otherCoins: count,
  availableCoins: count,
  reservedCoins: count,
  eligibleCoins: count,
  pendingConversions: count,
  approvedCentavos: count,
  pendingPayoutCentavos: count,
  paidCentavos: count,
  redemptionEnabled: z.boolean(),
});
export type EarningsBreakdown = z.infer<typeof earningsBreakdownSchema>;
