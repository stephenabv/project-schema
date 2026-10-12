import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asRole,
  createTestDatabase,
  createUser,
  hasDatabase,
  sqlState,
  tap,
  type TestDatabase,
} from "./support/database";

const PERMISSION_DENIED = "42501";

describe.skipIf(!hasDatabase)("row level security and privileges", () => {
  let db: TestDatabase;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    alice = await createUser(db.pool, { username: "alice" });
    bob = await createUser(db.pool, { username: "bob" });
    await tap(db.pool, alice);
    await tap(db.pool, bob);
  });

  afterAll(async () => {
    await db?.drop();
  });

  const denied = async (userId: string | null, sql: string, params: unknown[] = []) => {
    const error = await asRole(db.pool, userId, (c) => c.query(sql, params)).catch((e: unknown) => e);
    expect(sqlState(error)).toBe(PERMISSION_DENIED);
  };

  describe("cross-user isolation", () => {
    it.each(["wallets", "transactions", "tap_state"])("only shows the caller's own %s rows", async (table) => {
      const rows = await asRole(db.pool, alice, async (c) => (await c.query(`select user_id from public.${table}`)).rows);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === alice)).toBe(true);
    });

    it("cannot read another user's wallet by id", async () => {
      const rows = await asRole(db.pool, alice, async (c) =>
        (await c.query("select * from public.wallets where user_id = $1", [bob])).rows,
      );
      expect(rows).toEqual([]);
    });

    it("only shows the caller's own profile", async () => {
      const rows = await asRole(db.pool, alice, async (c) => (await c.query("select id from public.profiles")).rows);
      expect(rows).toEqual([{ id: alice }]);
    });

    it("cannot rename another user's profile", async () => {
      const result = await asRole(db.pool, alice, (c) =>
        c.query("update public.profiles set username = 'hijacked' where id = $1", [bob]),
      );
      expect(result.rowCount).toBe(0);
    });

    it("can rename its own profile", async () => {
      const result = await asRole(db.pool, alice, (c) =>
        c.query("update public.profiles set username = 'alice_renamed' where id = $1", [alice]),
      );
      expect(result.rowCount).toBe(1);
    });

    it("cannot change protected profile columns", async () => {
      await denied(alice, "update public.profiles set created_at = now() where id = $1", [alice]);
    });
  });

  describe("no direct client writes to balances or the ledger", () => {
    it("denies wallet balance updates", async () => {
      await denied(alice, "update public.wallets set balance_coins = 1000000 where user_id = $1", [alice]);
    });

    it("denies ledger inserts", async () => {
      await denied(
        alice,
        `insert into public.transactions (user_id, amount_coins, type, source_type, idempotency_key)
         values ($1, 1000, 'tap_reward', 'tap', $2)`,
        [alice, randomUUID()],
      );
    });

    it("denies ledger deletes", async () => {
      await denied(alice, "delete from public.transactions where user_id = $1", [alice]);
    });

    it("denies tap state updates", async () => {
      await denied(alice, "update public.tap_state set taps_today = 0 where user_id = $1", [alice]);
    });

    it("denies reading or granting roles", async () => {
      await denied(alice, "select * from public.user_roles");
      await denied(alice, "update public.user_roles set role = 'admin' where user_id = $1", [alice]);
    });

    it("keeps ledger entries immutable even for privileged roles", async () => {
      const error = await db.pool
        .query("update public.transactions set amount_coins = 999 where user_id = $1", [alice])
        .catch((e: unknown) => e);
      expect(sqlState(error)).toBe(PERMISSION_DENIED);
    });
  });

  describe("anonymous callers", () => {
    it.each(["profiles", "wallets", "transactions", "tap_state", "user_roles"])("cannot read %s", async (table) => {
      await denied(null, `select * from public.${table}`);
    });

    it.each([
      ["process_tap", `select public.process_tap('${randomUUID()}')`],
      ["get_dashboard_summary", "select public.get_dashboard_summary()"],
      ["get_reward_series", "select * from public.get_reward_series(7)"],
      ["list_transactions", "select * from public.list_transactions()"],
    ])("cannot execute %s", async (_name, sql) => {
      await denied(null, sql);
    });
  });

  it("does not expose the signup trigger function to clients", async () => {
    await denied(alice, "select public.handle_new_user()");
  });
});
