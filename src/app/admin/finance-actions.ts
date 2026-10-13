"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import type { FormState } from "@/lib/auth/form-state";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AppError } from "@/lib/errors";
import { formatPhp, formatRate } from "@/lib/formatting/money";
import { parseRecordId } from "@/lib/http/admin";
import { logger } from "@/lib/logger";
import { fieldErrorsOf } from "@/lib/validation/auth";
import {
  conversionTransitionSchema,
  ENABLE_CONFIRMATION,
  exchangeRateInputSchema,
  payoutMethodInputSchema,
  payoutTransitionSchema,
  redemptionPolicyInputSchema,
  STATUS_LABELS,
} from "@/lib/validation/redemption";
import { robotInputSchema, robotPolicyInputSchema } from "@/lib/validation/robots";
import { FinanceAdminService } from "@/services/finance-admin";

// Server Actions are public endpoints: each one re-checks the admin role, and
// the ve_admin_* database functions check it again and write the audit log.

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function values(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, text(formData, key)]));
}

async function run(
  operation: string,
  echo: Record<string, string>,
  fn: (finance: FinanceAdminService) => Promise<string | FormState>,
): Promise<FormState> {
  try {
    const { supabase } = await requireAdmin();
    const message = await fn(new FinanceAdminService(supabase));
    if (typeof message !== "string") return message;
    refresh();
    return { status: "success", message, values: echo };
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      return { status: "error", message: error.message, values: echo };
    }
    logger.error("admin_action_failed", { operation, code: error instanceof AppError ? error.code : "unknown" });
    return { status: "error", message: "Something went wrong. Please try again.", values: echo };
  }
}

function invalid<T>(result: z.ZodSafeParseResult<T>, echo: Record<string, string>): FormState | null {
  return result.success ? null : { status: "error", fieldErrors: fieldErrorsOf(result.error), values: echo };
}

// -- Robots -------------------------------------------------------------------

const ROBOT_FIELDS = [
  "id", "slug", "name", "description", "tier", "imageKey", "priceCoins", "coinsPerHour", "maxPerUser", "levelRequired", "status", "sortOrder",
] as const;

export async function saveRobot(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ROBOT_FIELDS);
  const { id, ...fields } = echo;
  const parsed = robotInputSchema.safeParse(fields);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("save_robot", echo, async (finance) => {
    const robot = await finance.saveRobot(id ? parseRecordId(id) : null, parsed.data);
    return id ? `Saved ${robot.name}. Robots already owned keep the rate they were bought with.` : `Created ${robot.name}.`;
  });
}

export async function updateRobotPolicy(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["maxOwned", "maxActive", "accrualCapHours"]);
  const parsed = robotPolicyInputSchema.safeParse(echo);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("update_robot_policy", echo, async (finance) => {
    await finance.updateRobotPolicy(parsed.data);
    return "Robot limits saved.";
  });
}

// -- Exchange -----------------------------------------------------------------

export async function setExchangeRate(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["rateCoins", "ratePesos", "effectiveAt", "reason", "confirmLargeChange"]);
  const parsed = exchangeRateInputSchema.safeParse({ ...echo, confirmLargeChange: echo.confirmLargeChange === "on" });
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("set_exchange_rate", echo, async (finance) => {
    const rate = await finance.setExchangeRate(parsed.data);
    return `Rate set to ${formatRate(rate.rateCoins, rate.rateCentavos)}. Requests already submitted keep their own rate.`;
  });
}

const POLICY_FIELDS = [
  "enabled", "minConversionCoins", "maxConversionCoins", "minPayoutPesos", "maxPayoutPesos", "processingDays", "reason", "confirmation",
] as const;

export async function updateRedemptionPolicy(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, POLICY_FIELDS);
  const parsed = redemptionPolicyInputSchema.safeParse({ ...echo, enabled: echo.enabled === "true" });
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  const echoBack = { ...echo, confirmation: "" };
  return run("update_redemption_policy", echoBack, async (finance) => {
    // Opening the program is the one change that needs a typed confirmation.
    const current = await finance.redemption();
    if (parsed.data.enabled && !current.policy.enabled && parsed.data.confirmation !== ENABLE_CONFIRMATION) {
      return {
        status: "error",
        fieldErrors: { confirmation: `Type ${ENABLE_CONFIRMATION} to open conversion and payouts` },
        values: echoBack,
      } satisfies FormState;
    }
    const policy = await finance.updateRedemptionPolicy(parsed.data);
    return policy.enabled
      ? `Conversion and payouts are open. Payouts from ${formatPhp(policy.minPayoutCentavos)}.`
      : "Conversion and payouts are closed to new requests. Open requests can still be reviewed.";
  });
}

export async function savePayoutMethod(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["id", "code", "name", "accountLabel", "isActive", "sortOrder"]);
  const { id, isActive, ...fields } = echo;
  const parsed = payoutMethodInputSchema.safeParse({ ...fields, isActive: isActive === "on" });
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("save_payout_method", echo, async (finance) => {
    const method = await finance.savePayoutMethod(id ? parseRecordId(id) : null, parsed.data);
    return id ? `Saved ${method.name}.` : `Added ${method.name}.`;
  });
}

// -- Conversion and payout review ----------------------------------------------

export async function transitionConversion(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["id", "to", "note", "reason"]);
  const { id, ...fields } = echo;
  const parsed = conversionTransitionSchema.safeParse(fields);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("transition_conversion", { id, to: "", note: "", reason: "" }, async (finance) => {
    const conversion = await finance.transitionConversion(parseRecordId(id), parsed.data);
    return `${conversion.reference} is now ${STATUS_LABELS[conversion.status].toLowerCase()}.`;
  });
}

export async function transitionPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["id", "to", "note", "reason", "paymentReference", "verified"]);
  const { id, verified, ...fields } = echo;
  const parsed = payoutTransitionSchema.safeParse({ ...fields, verified: verified === "on" });
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("transition_payout", { id, to: "", note: "", reason: "", paymentReference: "", verified: "" }, async (finance) => {
    const payout = await finance.transitionPayout(parseRecordId(id), parsed.data);
    return `${payout.reference} is now ${STATUS_LABELS[payout.status].toLowerCase()}.`;
  });
}
