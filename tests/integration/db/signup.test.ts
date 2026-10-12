import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createUser, hasDatabase, type TestDatabase } from "./support/database";

describe.skipIf(!hasDatabase)("signup provisioning", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db?.drop();
  });

  async function provisioned(userId: string) {
    const { rows } = await db.pool.query(
      `select p.username, w.balance_coins::int as balance, r.role, s.taps_today
         from public.profiles p
         join public.wallets w on w.user_id = p.id
         join public.user_roles r on r.user_id = p.id
         join public.tap_state s on s.user_id = p.id
        where p.id = $1`,
      [userId],
    );
    return rows[0];
  }

  it("creates a profile, a zero-balance wallet, tap state and the user role", async () => {
    const id = await createUser(db.pool, { username: "alice_01" });
    expect(await provisioned(id)).toEqual({
      username: "alice_01",
      balance: 0,
      role: "user",
      taps_today: 0,
    });
  });

  it("never grants admin from user metadata", async () => {
    const id = await createUser(db.pool, { username: "mallory", role: "admin", is_admin: true });
    expect((await provisioned(id)).role).toBe("user");
  });

  it("falls back to a generated username on a case-insensitive collision", async () => {
    await createUser(db.pool, { username: "SameName" });
    const id = await createUser(db.pool, { username: "samename" });
    const { username } = await provisioned(id);
    expect(username).toMatch(/^user_[0-9a-f]{12}$/);
  });

  it("falls back to a generated username when the requested one is malformed", async () => {
    const id = await createUser(db.pool, { username: "<script>alert(1)</script>" });
    expect((await provisioned(id)).username).toMatch(/^user_[0-9a-f]{12}$/);
  });

  it("generates a username when none is supplied", async () => {
    const id = await createUser(db.pool, {});
    expect((await provisioned(id)).username).toMatch(/^user_[0-9a-f]{12}$/);
  });
});
