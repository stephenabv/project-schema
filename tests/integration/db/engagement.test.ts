import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  balanceOf,
  createTestDatabase,
  createUser,
  disableAchievements,
  hasDatabase,
  ledgerSum,
  sqlState,
  tap,
  type TestDatabase,
} from "./support/database";

async function call<T>(pool: Pool, userId: string | null, sql: string, params: unknown[] = []): Promise<T> {
  return asRole(pool, userId, async (client) => (await client.query(sql, params)).rows[0]?.result as T);
}

async function rejectsWith(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return sqlState(error);
  }
  return undefined;
}

/** Pretends the last bonus was claimed `daysAgo` UTC days ago with the given streak (superuser only). */
async function setLastBonus(pool: Pool, userId: string, daysAgo: number, streak: number): Promise<void> {
  await pool.query(
    `update public.player_progress
     set last_bonus_on = timezone('utc', now())::date - $2::integer, current_streak = $3,
         longest_streak = greatest(longest_streak, $3)
     where user_id = $1`,
    [userId, daysAgo, streak],
  );
}

async function credit(pool: Pool, userId: string, amount: number): Promise<void> {
  await pool.query(
    `insert into public.transactions (user_id, amount_coins, type, source_type, idempotency_key)
     values ($1, $2, 'admin_adjustment', 'test', gen_random_uuid())`,
    [userId, amount],
  );
  await pool.query("update public.wallets set balance_coins = balance_coins + $2 where user_id = $1", [userId, amount]);
}

async function itemId(pool: Pool, slug: string): Promise<string> {
  return (await pool.query("select id from public.shop_items where slug = $1", [slug])).rows[0].id;
}

interface BonusResult {
  duplicate: boolean;
  rewardCoins: number;
  currentStreak: number;
  longestStreak: number;
  balanceCoins: number;
}

const claimBonus = (pool: Pool, userId: string, key = randomUUID()) =>
  call<BonusResult>(pool, userId, "select public.claim_daily_bonus($1) as result", [key]);

describe.skipIf(!hasDatabase)("engagement: daily bonus, leaderboard, shop, notifications", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe("daily bonus and streaks", () => {
    it("pays once per UTC day, idempotently", async () => {
      await disableAchievements(db.pool);
      const user = await createUser(db.pool);
      const key = randomUUID();

      const first = await claimBonus(db.pool, user, key);
      expect(first).toMatchObject({ duplicate: false, rewardCoins: 20, currentStreak: 1, balanceCoins: 20 });
      await expect(claimBonus(db.pool, user, key)).resolves.toMatchObject({ duplicate: true, rewardCoins: 20 });
      await expect(rejectsWith(claimBonus(db.pool, user))).resolves.toBe("VE004");

      expect(await balanceOf(db.pool, user)).toBe(20);
      expect(await ledgerSum(db.pool, user)).toBe(20);
      await expect(call(db.pool, user, "select public.get_daily_bonus_status() as result")).resolves.toMatchObject({
        claimedToday: true,
        currentStreak: 1,
        nextRewardCoins: 30,
      });
    });

    it("grows the reward on consecutive days, caps it, and resets after a missed day", async () => {
      const user = await createUser(db.pool);
      await claimBonus(db.pool, user);

      await setLastBonus(db.pool, user, 1, 1);
      await expect(claimBonus(db.pool, user)).resolves.toMatchObject({ currentStreak: 2, rewardCoins: 30 });

      await setLastBonus(db.pool, user, 1, 20);
      await expect(claimBonus(db.pool, user)).resolves.toMatchObject({ currentStreak: 21, rewardCoins: 80, longestStreak: 21 });

      await setLastBonus(db.pool, user, 2, 21);
      await expect(call(db.pool, user, "select public.get_daily_bonus_status() as result")).resolves.toMatchObject({
        claimedToday: false,
        currentStreak: 0,
        longestStreak: 21,
        nextRewardCoins: 20,
      });
      await expect(claimBonus(db.pool, user)).resolves.toMatchObject({ currentStreak: 1, rewardCoins: 20, longestStreak: 21 });
    });

    it("unlocks streak badges and notifies the player", async () => {
      await db.pool.query("update public.achievements set is_active = (slug like 'streak-%')");
      const user = await createUser(db.pool);
      await claimBonus(db.pool, user);
      await setLastBonus(db.pool, user, 1, 2);

      const result = await call<{ unlockedAchievements: { slug: string }[] }>(
        db.pool, user, "select public.claim_daily_bonus($1) as result", [randomUUID()],
      );
      expect(result.unlockedAchievements.map((a) => a.slug)).toEqual(["streak-three"]);

      const inbox = await call<{ items: { kind: string; title: string }[]; unread: number }>(
        db.pool, user, "select public.ve_list_notifications(10) as result",
      );
      expect(inbox.items.some((n) => n.kind === "badge" && n.title.includes("Warming Up"))).toBe(true);
      expect(inbox.unread).toBeGreaterThan(0);
      await db.pool.query("update public.achievements set is_active = false");
    });

    it("is blocked for suspended accounts", async () => {
      const user = await createUser(db.pool);
      await db.pool.query("update public.player_profiles set suspended_at = now(), suspension_reason = 'test' where id = $1", [user]);
      await expect(rejectsWith(claimBonus(db.pool, user))).resolves.toBe("VE006");
    });
  });

  describe("shop", () => {
    it("sells cosmetics for virtual coins with ownership, level and balance checks", async () => {
      const user = await createUser(db.pool);
      const sunset = await itemId(db.pool, "skin-sunset");
      const aurora = await itemId(db.pool, "skin-aurora");

      await expect(
        rejectsWith(call(db.pool, user, "select public.purchase_item($1, $2) as result", [sunset, randomUUID()])),
      ).resolves.toBe("VE008");

      await credit(db.pool, user, 2000);
      const key = randomUUID();
      const bought = await call<{ duplicate: boolean; balanceCoins: number; priceCoins: number }>(
        db.pool, user, "select public.purchase_item($1, $2) as result", [sunset, key],
      );
      expect(bought).toMatchObject({ duplicate: false, priceCoins: 300, balanceCoins: 1700 });
      await expect(
        call(db.pool, user, "select public.purchase_item($1, $2) as result", [sunset, key]),
      ).resolves.toMatchObject({ duplicate: true });
      await expect(
        rejectsWith(call(db.pool, user, "select public.purchase_item($1, $2) as result", [sunset, randomUUID()])),
      ).resolves.toBe("VE013");
      await expect(
        rejectsWith(call(db.pool, user, "select public.purchase_item($1, $2) as result", [aurora, randomUUID()])),
      ).resolves.toBe("VE009");

      expect(await balanceOf(db.pool, user)).toBe(1700);
      expect(await ledgerSum(db.pool, user)).toBe(1700);

      // Spending is not earning: progress totals are untouched.
      const { rows } = await db.pool.query("select total_coins_earned::int as earned from public.player_progress where user_id = $1", [user]);
      expect(rows[0].earned).toBe(0);
    });

    it("equips one item per category", async () => {
      const user = await createUser(db.pool);
      await credit(db.pool, user, 1000);
      const sunset = await itemId(db.pool, "skin-sunset");
      const ocean = await itemId(db.pool, "skin-ocean");
      for (const id of [sunset, ocean]) {
        await call(db.pool, user, "select public.purchase_item($1, $2) as result", [id, randomUUID()]);
      }

      await call(db.pool, user, "select public.equip_item($1, true) as result", [sunset]);
      await expect(call(db.pool, user, "select public.equip_item($1, true) as result", [ocean])).resolves.toMatchObject({
        tapSkin: "ocean",
      });
      const shop = await call<{ items: { slug: string; equipped: boolean; owned: boolean }[] }>(
        db.pool, user, "select public.list_shop() as result",
      );
      expect(shop.items.filter((i) => i.equipped).map((i) => i.slug)).toEqual(["skin-ocean"]);

      await expect(call(db.pool, user, "select public.equip_item($1, false) as result", [ocean])).resolves.toMatchObject({
        tapSkin: null,
      });
      const frame = await itemId(db.pool, "frame-gold");
      await expect(
        rejectsWith(call(db.pool, user, "select public.equip_item($1, true) as result", [frame])),
      ).resolves.toBe("VE012");
    });

    it("keeps inventory and shop tables read-only for players", async () => {
      const user = await createUser(db.pool);
      const sunset = await itemId(db.pool, "skin-sunset");
      await expect(
        rejectsWith(
          call(db.pool, user, "insert into public.user_inventory (user_id, item_id, category, transaction_id) values ($1, $2, 'tap_skin', gen_random_uuid())", [user, sunset]),
        ),
      ).resolves.toBe("42501");
      await expect(rejectsWith(call(db.pool, user, "update public.shop_items set price_coins = 1"))).resolves.toBe("42501");
    });
  });

  describe("leaderboard", () => {
    it("ranks by XP, shows only public fields, and honours opt-out and suspension", async () => {
      const db2 = await createTestDatabase();
      try {
        await disableAchievements(db2.pool);
        const alice = await createUser(db2.pool, { username: "alice" });
        const bob = await createUser(db2.pool, { username: "bob" });
        const carol = await createUser(db2.pool, { username: "carol" });
        await tap(db2.pool, alice);
        await db2.pool.query("update public.player_progress set xp_total = 500 where user_id = $1", [alice]);
        await db2.pool.query("update public.player_progress set xp_total = 300 where user_id = $1", [bob]);
        await db2.pool.query("update public.player_progress set xp_total = 900 where user_id = $1", [carol]);

        const board = await call<{ entries: Record<string, unknown>[]; you: { rank: number } }>(
          db2.pool, bob, "select public.get_leaderboard('xp', 10) as result",
        );
        expect(board.entries.map((e) => e.username)).toEqual(["carol", "alice", "bob"]);
        expect(board.you.rank).toBe(3);
        expect(board.entries[2]).toMatchObject({ isYou: true, rank: 3 });
        expect(Object.keys(board.entries[0]).sort()).toEqual(
          ["avatarKey", "frame", "isYou", "level", "rank", "score", "title", "username"].sort(),
        );

        // Players can opt out through their own profile row.
        await call(db2.pool, carol, "update public.player_profiles set leaderboard_opt_out = true where id = $1", [carol]);
        await db2.pool.query("update public.player_profiles set suspended_at = now(), suspension_reason = 'bot' where id = $1", [alice]);
        const after = await call<{ entries: { username: string }[]; you: { rank: number } }>(
          db2.pool, bob, "select public.get_leaderboard('xp', 10) as result",
        );
        expect(after.entries.map((e) => e.username)).toEqual(["bob"]);
        expect(after.you.rank).toBe(1);

        const weekly = await call<{ entries: { username: string; score: number }[] }>(
          db2.pool, bob, "select public.get_leaderboard('weekly', 10) as result",
        );
        expect(weekly.entries).toEqual([]);
        await expect(
          rejectsWith(call(db2.pool, bob, "select public.get_leaderboard('all_time_money', 10) as result")),
        ).resolves.toBe("22023");
      } finally {
        await db2.drop();
      }
    });
  });

  describe("notifications", () => {
    it("notifies players about admin actions and lets them mark items read", async () => {
      const admin = await createUser(db.pool);
      const player = await createUser(db.pool);
      await db.pool.query("insert into public.user_roles (user_id, role) values ($1, 'admin') on conflict (user_id) do update set role = 'admin'", [admin]);

      await call(db.pool, admin, "select public.ve_admin_adjust_balance($1, 75, 'Event prize', $2) as result", [player, randomUUID()]);

      const inbox = await call<{ items: { id: string; kind: string; title: string; read: boolean }[]; unread: number }>(
        db.pool, player, "select public.ve_list_notifications(10) as result",
      );
      expect(inbox.items[0]).toMatchObject({ kind: "wallet", title: "An admin added 75 virtual coins", read: false });
      expect(inbox.unread).toBe(1);

      await expect(
        call(db.pool, player, "select public.ve_mark_notifications_read($1::uuid[]) as result", [[inbox.items[0].id]]),
      ).resolves.toBe(1);
      await expect(call(db.pool, player, "select public.ve_unread_notification_count() as result")).resolves.toBe(0);
    });

    it("never exposes or marks another player's notifications", async () => {
      const owner = await createUser(db.pool);
      const other = await createUser(db.pool);
      await db.pool.query("select ve_private.notify($1, 'account', 'Private', '', null)", [owner]);
      const { rows } = await db.pool.query("select id from public.ve_notifications where user_id = $1", [owner]);

      await expect(call(db.pool, other, "select count(*)::int as result from public.ve_notifications")).resolves.toBe(0);
      await expect(
        call(db.pool, other, "select public.ve_mark_notifications_read($1::uuid[]) as result", [[rows[0].id]]),
      ).resolves.toBe(0);
      await expect(rejectsWith(call(db.pool, other, "select ve_private.notify($1, 'account', 'x', '', null)", [owner]))).resolves.toBe(
        "42501",
      );
    });

    it("returns only the newest notifications up to the requested limit", async () => {
      const user = await createUser(db.pool);
      for (let i = 0; i < 35; i += 1) {
        await db.pool.query("select ve_private.notify($1, 'account', $2, '', null)", [user, `n${i}`]);
      }
      const list = (await call(db.pool, user, "select public.ve_list_notifications(30) as result")) as {
        items: { title: string }[];
        unread: number;
      };
      expect(list.items).toHaveLength(30);
      expect(list.unread).toBe(35);
      await expect(rejectsWith(call(db.pool, user, "select public.ve_list_notifications(101) as result"))).resolves.toBe("22023");
    });
  });
});
