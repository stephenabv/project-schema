/**
 * Public API contracts. Every balance is virtual: `currency` is always "VC"
 * and `redeemable` is always false.
 */
import type { TransactionType } from "./database";

export type VirtualCurrency = "VC";

export interface VirtualAmount {
  currency: VirtualCurrency;
  redeemable: false;
}

export interface TapResponse extends VirtualAmount {
  success: true;
  duplicate: boolean;
  transactionId: string;
  rewardCoins: number;
  balanceCoins: number;
  tapsToday: number;
}

export interface WalletResponse extends VirtualAmount {
  balanceCoins: number;
  label: "Virtual coins";
  updatedAt: string;
}

export interface TransactionDto {
  id: string;
  amountCoins: number;
  type: TransactionType;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

export interface TransactionPage {
  items: TransactionDto[];
  nextCursor: string | null;
  currency: VirtualCurrency;
  redeemable: false;
}

export interface TapPolicy {
  rewardCoins: number;
  cooldownMs: number;
  dailyLimit: number;
}

export interface DashboardSummary extends VirtualAmount {
  balanceCoins: number;
  walletUpdatedAt: string;
  totalEarnedCoins: number;
  todayEarnedCoins: number;
  actionsCompleted: number;
  tapsToday: number;
  lastTapAt: string | null;
  policy: TapPolicy;
}

export interface RewardSeriesPoint {
  day: string;
  coins: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  series: RewardSeriesPoint[];
}

export const API_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "VALIDATION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "NOT_FOUND",
  "COOLDOWN_ACTIVE",
  "DAILY_LIMIT_REACHED",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
}
