import "server-only";
import { z } from "zod";
import { maskAccountNumber, PayoutDetailsCipher } from "@/lib/crypto/payout-details";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  conversionSchema,
  earningsBreakdownSchema,
  payoutSchema,
  redemptionOverviewSchema,
  type Conversion,
  type ConversionRequest,
  type EarningsBreakdown,
  type Payout,
  type PayoutRequest,
  type RedemptionOverview,
} from "@/lib/validation/redemption";
import { parseContract } from "./contract";

const HISTORY_LIMIT = 50;

/**
 * Player side of VC-to-PHP conversion and payouts. The database owns the
 * rate, the arithmetic, the thresholds and every balance; this service never
 * sends an amount the player could not also send directly.
 */
export class RedemptionService {
  constructor(
    private readonly db: AppSupabaseClient,
    private readonly cipherFactory: () => PayoutDetailsCipher = PayoutDetailsCipher.fromEnvironment,
  ) {}

  async overview(): Promise<RedemptionOverview> {
    const { data, error } = await this.db.rpc("get_redemption_overview");
    if (error) throw toAppError(error, "get_redemption_overview");
    return parseContract(redemptionOverviewSchema, data, "get_redemption_overview");
  }

  async breakdown(): Promise<EarningsBreakdown> {
    const { data, error } = await this.db.rpc("get_earnings_breakdown");
    if (error) throw toAppError(error, "get_earnings_breakdown");
    return parseContract(earningsBreakdownSchema, data, "get_earnings_breakdown");
  }

  async conversions(): Promise<Conversion[]> {
    const { data, error } = await this.db.rpc("list_my_conversions", { p_limit: HISTORY_LIMIT });
    if (error) throw toAppError(error, "list_my_conversions");
    return parseContract(z.array(conversionSchema), data, "list_my_conversions");
  }

  async requestConversion(input: ConversionRequest): Promise<Conversion> {
    const { data, error } = await this.db.rpc("request_conversion", {
      p_coins: input.coins,
      p_expected_rate_id: input.rateId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw toAppError(error, "request_conversion");
    return parseContract(conversionSchema, data, "request_conversion");
  }

  async cancelConversion(id: string): Promise<Conversion> {
    const { data, error } = await this.db.rpc("cancel_conversion", { p_id: id });
    if (error) throw toAppError(error, "cancel_conversion");
    return parseContract(conversionSchema, data, "cancel_conversion");
  }

  async payouts(): Promise<Payout[]> {
    const { data, error } = await this.db.rpc("list_my_payouts", { p_limit: HISTORY_LIMIT });
    if (error) throw toAppError(error, "list_my_payouts");
    return parseContract(z.array(payoutSchema), data, "list_my_payouts");
  }

  /** Encrypts the account details here, so the database only ever holds ciphertext. */
  async requestPayout(input: PayoutRequest): Promise<Payout> {
    const cipher = this.cipherFactory();
    const { data, error } = await this.db.rpc("request_payout", {
      p_method_id: input.methodId,
      p_amount_centavos: input.amountCentavos,
      p_account_details: cipher.encrypt({ accountName: input.accountName, accountNumber: input.accountNumber }),
      p_account_hint: maskAccountNumber(input.accountNumber),
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw toAppError(error, "request_payout");
    return parseContract(payoutSchema, data, "request_payout");
  }

  async cancelPayout(id: string): Promise<Payout> {
    const { data, error } = await this.db.rpc("cancel_payout", { p_id: id });
    if (error) throw toAppError(error, "cancel_payout");
    return parseContract(payoutSchema, data, "cancel_payout");
  }
}
