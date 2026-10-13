import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";
import { DashboardService } from "@/services/dashboard";
import { RewardService } from "@/services/rewards";
import { WalletService } from "@/services/wallet";
import { createFakeSupabase } from "./support/fake-supabase";

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const TX = "9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a90";

const tapResult = {
  success: true,
  duplicate: false,
  transactionId: TX,
  rewardCoins: 10,
  balanceCoins: 510,
  tapsToday: 51,
  currency: "VC",
  redeemable: false,
};

afterEach(() => vi.restoreAllMocks());

describe("RewardService", () => {
  it("sends only the idempotency key to the database", async () => {
    const fake = createFakeSupabase({ rpc: { process_tap: { data: tapResult, error: null } } });
    const result = await new RewardService(fake.client).processTap(KEY);

    expect(fake.rpc).toHaveBeenCalledWith("process_tap", { p_idempotency_key: KEY });
    expect(result).toEqual(tapResult);
  });

  it("maps database errors to domain errors", async () => {
    const fake = createFakeSupabase({ rpc: { process_tap: { data: null, error: { code: "VE001" } } } });
    await expect(new RewardService(fake.client).processTap(KEY)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("rejects results that break the contract (e.g. a redeemable balance)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = createFakeSupabase({
      rpc: { process_tap: { data: { ...tapResult, redeemable: true }, error: null } },
    });
    await expect(new RewardService(fake.client).processTap(KEY)).rejects.toBeInstanceOf(InternalError);
  });
});

describe("WalletService.getWallet", () => {
  it("labels the balance as virtual and non-redeemable", async () => {
    const fake = createFakeSupabase({
      table: { data: { balance_coins: 120, updated_at: "2026-10-12T00:00:00+00:00" }, error: null },
    });
    const wallet = await new WalletService(fake.client).getWallet("user-1");

    expect(fake.from).toHaveBeenCalledWith("wallets");
    expect(fake.chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(wallet).toEqual({
      balanceCoins: 120,
      currency: "VC",
      label: "Virtual coins",
      redeemable: false,
      updatedAt: "2026-10-12T00:00:00+00:00",
    });
  });

  it("throws NotFound when RLS hides the row", async () => {
    const fake = createFakeSupabase({ table: { data: null, error: null } });
    await expect(new WalletService(fake.client).getWallet("user-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("WalletService.listTransactions", () => {
  const row = (i: number) => ({
    id: `9b2f9c3e-1d4a-4c55-8a7e-0c3f4d2b1a${String(i).padStart(2, "0")}`,
    amount_coins: 10,
    type: "tap_reward",
    source_type: "tap",
    source_id: null,
    created_at: `2026-10-12T10:00:${String(59 - i).padStart(2, "0")}.123456+00:00`,
  });

  it("requests one extra row and returns a cursor when more exist", async () => {
    const fake = createFakeSupabase({
      rpc: { list_transactions: { data: [row(1), row(2), row(3)], error: null } },
    });
    const page = await new WalletService(fake.client).listTransactions({ limit: 2, type: "tap_reward" });

    expect(fake.rpc).toHaveBeenCalledWith("list_transactions", {
      p_limit: 3,
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_type: "tap_reward",
      p_from: null,
      p_to: null,
    });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ amountCoins: 10, type: "tap_reward", sourceType: "tap" });
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor!)).toEqual({ createdAt: row(2).created_at, id: row(2).id });
  });

  it("passes the decoded cursor through and ends pagination on the last page", async () => {
    const fake = createFakeSupabase({ rpc: { list_transactions: { data: [row(4)], error: null } } });
    const cursor = encodeCursor({ createdAt: row(3).created_at, id: row(3).id });
    const page = await new WalletService(fake.client).listTransactions({ limit: 2, cursor });

    expect(fake.rpc.mock.calls[0][1]).toMatchObject({
      p_cursor_created_at: row(3).created_at,
      p_cursor_id: row(3).id,
    });
    expect(page.nextCursor).toBeNull();
  });

  it("rejects a tampered cursor before querying", async () => {
    const fake = createFakeSupabase();
    await expect(new WalletService(fake.client).listTransactions({ limit: 2, cursor: "bogus" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe("DashboardService", () => {
  it("validates the summary and the reward series", async () => {
    const summary = {
      balanceCoins: 30,
      walletUpdatedAt: "2026-10-12T00:00:00+00:00",
      totalEarnedCoins: 70,
      todayEarnedCoins: 30,
      actionsCompleted: 3,
      tapsToday: 3,
      lastTapAt: null,
      policy: { rewardCoins: 10, cooldownMs: 1000, dailyLimit: 1000 },
      currency: "VC",
      redeemable: false,
    };
    const series = [{ day: "2026-10-12", coins: 30 }];
    const fake = createFakeSupabase({
      rpc: {
        get_dashboard_summary: { data: summary, error: null },
        get_reward_series: { data: series, error: null },
      },
    });
    const service = new DashboardService(fake.client);

    await expect(service.getSummary()).resolves.toEqual(summary);
    await expect(service.getRewardSeries(7)).resolves.toEqual(series);
    expect(fake.rpc).toHaveBeenCalledWith("get_reward_series", { p_days: 7 });
  });
});
