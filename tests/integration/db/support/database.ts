import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client, Pool, type PoolClient } from "pg";

const ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const SHIM_PATH = path.join(__dirname, "supabase-shim.sql");

export const adminUrl = process.env.TEST_DATABASE_URL;

/** True when a PostgreSQL instance is configured for the database suite. */
export const hasDatabase = Boolean(adminUrl);

export interface TestDatabase {
  pool: Pool;
  drop(): Promise<void>;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Creates an isolated database, applies the Supabase shim and every migration
 * in order, and returns a pool connected as the superuser (like the Supabase
 * "postgres" role). Each test file gets its own database.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  if (!adminUrl) throw new Error("TEST_DATABASE_URL is not set");

  const name = `ve_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const pool = new Pool({ connectionString: withDatabase(adminUrl, name), max: 20 });
  await pool.query(readFileSync(SHIM_PATH, "utf8"));

  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    await pool.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }

  return {
    pool,
    async drop() {
      await pool.end();
      const cleanup = new Client({ connectionString: adminUrl });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

/** Simulates a Supabase signup: inserting into auth.users fires the trigger. */
export async function createUser(
  pool: Pool,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, `${id}@example.test`, JSON.stringify(metadata)],
  );
  return id;
}

/**
 * Runs `fn` in one transaction as the given Supabase role, with the JWT "sub"
 * claim set the way PostgREST does. `userId: null` means an anonymous caller.
 */
export async function asRole<T>(
  pool: Pool,
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export interface TapResult {
  success: boolean;
  duplicate: boolean;
  transactionId: string;
  rewardCoins: number;
  balanceCoins: number;
  tapsToday: number;
  xpEarned: number;
  xpTotal: number;
  level: number;
  unlockedAchievements: { slug: string; rewardCoins: number }[];
  currency: "VC";
  redeemable: false;
}

export function tap(pool: Pool, userId: string, key: string = randomUUID()): Promise<TapResult> {
  return asRole(pool, userId, async (client) => {
    const { rows } = await client.query("select public.process_tap($1) as result", [key]);
    return rows[0].result as TapResult;
  });
}

/** Clears the cooldown so the next tap is accepted (superuser-only helper). */
export async function clearCooldown(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    "update public.tap_state set last_tap_at = now() - interval '10 seconds' where user_id = $1",
    [userId],
  );
}

export async function balanceOf(pool: Pool, userId: string): Promise<number> {
  const { rows } = await pool.query(
    "select balance_coins::int as balance from public.wallets where user_id = $1",
    [userId],
  );
  return rows[0].balance;
}

export async function ledgerSum(pool: Pool, userId: string): Promise<number> {
  const { rows } = await pool.query(
    "select coalesce(sum(amount_coins), 0)::int as total, count(*)::int as count from public.transactions where user_id = $1",
    [userId],
  );
  return rows[0].total;
}

export async function ledgerCount(pool: Pool, userId: string): Promise<number> {
  const { rows } = await pool.query(
    "select count(*)::int as count from public.transactions where user_id = $1",
    [userId],
  );
  return rows[0].count;
}

/** Extracts the SQLSTATE from a pg error for assertions. */
export function sqlState(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Turns off achievement rewards so a suite can assert tap and ledger
 * mechanics in isolation (achievements pay their own ledger entries).
 */
export async function disableAchievements(pool: Pool): Promise<void> {
  await pool.query("update public.achievements set is_active = false");
}
