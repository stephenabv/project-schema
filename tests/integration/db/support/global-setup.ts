import { Client } from "pg";

/**
 * Roles are cluster-wide, so they are created once here instead of in every
 * per-file test database (parallel CREATE ROLE calls would race).
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rowCount } = await client.query("select 1 from pg_roles where rolname = $1", [role]);
      if (!rowCount) {
        const bypass = role === "service_role" ? " bypassrls" : "";
        await client.query(`create role ${role} nologin noinherit${bypass}`);
      }
    }
  } finally {
    await client.end();
  }
}
