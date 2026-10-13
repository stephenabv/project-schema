import "server-only";
import { z } from "zod";
import { PayoutDetailsCipher, type PayoutAccountDetails } from "@/lib/crypto/payout-details";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  adminConversionPageSchema,
  adminConversionSchema,
  adminPayoutDetailSchema,
  adminPayoutMethodSchema,
  adminPayoutPageSchema,
  adminPayoutSchema,
  adminRedemptionSchema,
  exchangeRateSchema,
  financeOverviewSchema,
  ledgerIssueSchema,
  redemptionPolicySchema,
  type AdminConversion,
  type AdminPayout,
  type AdminPayoutMethod,
  type AdminRedemption,
  type ConversionTransition,
  type ExchangeRate,
  type ExchangeRateInput,
  type FinanceOverview,
  type LedgerIssue,
  type PayoutMethodInput,
  type PayoutTransition,
  type RedemptionPolicy,
  type RedemptionPolicyInput,
} from "@/lib/validation/redemption";
import {
  adminRobotSchema,
  adminRobotsSchema,
  robotActivitySchema,
  robotPolicySchema,
  type AdminRobot,
  type RobotActivity,
  type RobotInput,
  type RobotPolicy,
  type RobotPolicyInput,
} from "@/lib/validation/robots";
import { parseContract } from "./contract";

export const FINANCE_PAGE_SIZE = 25;
/** Cap for CSV exports, matching the other admin exports. */
export const FINANCE_EXPORT_LIMIT = 5000;

export interface RequestFilter {
  status?: string;
  q?: string;
  page: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** A payout with its account details decrypted for review (null when unreadable). */
export type AdminPayoutDetail = AdminPayout & { account: PayoutAccountDetails | null };

/**
 * Admin side of robots, exchange rates, conversions and payouts. Every call
 * is a ve_admin_* database function that re-checks the admin role and writes
 * the audit log; this class adds no authorization of its own.
 */
export class FinanceAdminService {
  constructor(
    private readonly db: AppSupabaseClient,
    private readonly cipherFactory: () => PayoutDetailsCipher = PayoutDetailsCipher.fromEnvironment,
  ) {}

  // -- Robots ---------------------------------------------------------------

  async listRobots(): Promise<{ robots: AdminRobot[]; policy: RobotPolicy }> {
    const { data, error } = await this.db.rpc("ve_admin_list_robots");
    if (error) throw toAppError(error, "ve_admin_list_robots");
    return parseContract(adminRobotsSchema, data, "ve_admin_list_robots");
  }

  async saveRobot(id: string | null, input: RobotInput): Promise<AdminRobot> {
    const { data, error } = await this.db.rpc("ve_admin_save_robot", { p_id: id, p_robot: input });
    if (error) throw toAppError(error, "ve_admin_save_robot");
    return parseContract(adminRobotSchema, data, "ve_admin_save_robot");
  }

  async updateRobotPolicy(input: RobotPolicyInput): Promise<RobotPolicy> {
    const { data, error } = await this.db.rpc("ve_admin_update_robot_policy", { p_policy: input });
    if (error) throw toAppError(error, "ve_admin_update_robot_policy");
    return parseContract(robotPolicySchema, data, "ve_admin_update_robot_policy");
  }

  async robotActivity(limit = 50): Promise<RobotActivity> {
    const { data, error } = await this.db.rpc("ve_admin_robot_activity", { p_limit: limit });
    if (error) throw toAppError(error, "ve_admin_robot_activity");
    return parseContract(robotActivitySchema, data, "ve_admin_robot_activity");
  }

  // -- Exchange -------------------------------------------------------------

  async redemption(): Promise<AdminRedemption> {
    const { data, error } = await this.db.rpc("ve_admin_get_redemption");
    if (error) throw toAppError(error, "ve_admin_get_redemption");
    return parseContract(adminRedemptionSchema, data, "ve_admin_get_redemption");
  }

  async setExchangeRate(input: ExchangeRateInput): Promise<ExchangeRate> {
    const { data, error } = await this.db.rpc("ve_admin_set_exchange_rate", {
      p_rate_coins: input.rateCoins,
      p_rate_centavos: input.ratePesos,
      p_effective_at: input.effectiveAt,
      p_reason: input.reason,
      p_confirm_large_change: input.confirmLargeChange,
    });
    if (error) throw toAppError(error, "ve_admin_set_exchange_rate");
    return parseContract(exchangeRateSchema, data, "ve_admin_set_exchange_rate");
  }

  async updateRedemptionPolicy(input: RedemptionPolicyInput): Promise<RedemptionPolicy> {
    const { data, error } = await this.db.rpc("ve_admin_update_redemption_policy", {
      p_policy: {
        enabled: input.enabled,
        minConversionCoins: input.minConversionCoins,
        maxConversionCoins: input.maxConversionCoins,
        minPayoutCentavos: input.minPayoutPesos,
        maxPayoutCentavos: input.maxPayoutPesos,
        processingDays: input.processingDays,
      },
      p_reason: input.reason,
    });
    if (error) throw toAppError(error, "ve_admin_update_redemption_policy");
    return parseContract(redemptionPolicySchema, data, "ve_admin_update_redemption_policy");
  }

  async savePayoutMethod(id: string | null, input: PayoutMethodInput): Promise<AdminPayoutMethod> {
    const { data, error } = await this.db.rpc("ve_admin_save_payout_method", { p_id: id, p_method: input });
    if (error) throw toAppError(error, "ve_admin_save_payout_method");
    return parseContract(adminPayoutMethodSchema, data, "ve_admin_save_payout_method");
  }

  // -- Conversions ----------------------------------------------------------

  async listConversions(filter: RequestFilter, limit = FINANCE_PAGE_SIZE): Promise<Page<AdminConversion>> {
    const { data, error } = await this.db.rpc("ve_admin_list_conversions", {
      p_status: filter.status ?? null,
      p_search: filter.q ?? null,
      p_limit: limit,
      p_offset: (filter.page - 1) * limit,
    });
    if (error) throw toAppError(error, "ve_admin_list_conversions");
    return parseContract(adminConversionPageSchema, data, "ve_admin_list_conversions");
  }

  async transitionConversion(id: string, input: ConversionTransition): Promise<AdminConversion> {
    const { data, error } = await this.db.rpc("ve_admin_transition_conversion", {
      p_id: id,
      p_to: input.to,
      p_note: input.note || null,
      p_reason: input.reason || null,
    });
    if (error) throw toAppError(error, "ve_admin_transition_conversion");
    return parseContract(adminConversionSchema, data, "ve_admin_transition_conversion");
  }

  // -- Payouts --------------------------------------------------------------

  async listPayouts(filter: RequestFilter, limit = FINANCE_PAGE_SIZE): Promise<Page<AdminPayout>> {
    const { data, error } = await this.db.rpc("ve_admin_list_payouts", {
      p_status: filter.status ?? null,
      p_search: filter.q ?? null,
      p_limit: limit,
      p_offset: (filter.page - 1) * limit,
    });
    if (error) throw toAppError(error, "ve_admin_list_payouts");
    return parseContract(adminPayoutPageSchema, data, "ve_admin_list_payouts");
  }

  /** One payout with decrypted account details. The database audits the read. */
  async getPayout(id: string): Promise<AdminPayoutDetail> {
    const { data, error } = await this.db.rpc("ve_admin_get_payout", { p_id: id });
    if (error) throw toAppError(error, "ve_admin_get_payout");
    const { accountDetails, ...payout } = parseContract(adminPayoutDetailSchema, data, "ve_admin_get_payout");
    return { ...payout, account: this.cipherFactory().decrypt(accountDetails) };
  }

  async transitionPayout(id: string, input: PayoutTransition): Promise<AdminPayout> {
    const { data, error } = await this.db.rpc("ve_admin_transition_payout", {
      p_id: id,
      p_to: input.to,
      p_note: input.note || null,
      p_reason: input.reason || null,
      p_payment_reference: input.paymentReference || null,
    });
    if (error) throw toAppError(error, "ve_admin_transition_payout");
    return parseContract(adminPayoutSchema, data, "ve_admin_transition_payout");
  }

  // -- Integrity ------------------------------------------------------------

  async overview(): Promise<FinanceOverview> {
    const { data, error } = await this.db.rpc("ve_admin_finance_overview");
    if (error) throw toAppError(error, "ve_admin_finance_overview");
    return parseContract(financeOverviewSchema, data, "ve_admin_finance_overview");
  }

  async ledgerCheck(): Promise<LedgerIssue[]> {
    const { data, error } = await this.db.rpc("ve_admin_ledger_check");
    if (error) throw toAppError(error, "ve_admin_ledger_check");
    return parseContract(z.array(ledgerIssueSchema), data, "ve_admin_ledger_check");
  }
}
