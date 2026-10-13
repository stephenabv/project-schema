import { vi } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/server";

export interface FakeResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/**
 * A minimal stand-in for the Supabase client: `rpc` resolves to queued
 * results and the `from().select()|update().eq().maybeSingle()` chain resolves to
 * `tableResult`. Calls are recorded for assertions.
 */
export function createFakeSupabase(options: { rpc?: Record<string, FakeResult>; table?: FakeResult } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const rpc = vi.fn(async (name: string, _args?: unknown) => options.rpc?.[name] ?? { data: null, error: { code: "XX000" } });

  const chain = {
    select: vi.fn(() => chain),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update: vi.fn((_values: unknown) => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => options.table ?? { data: null, error: null }),
  };
  const from = vi.fn(() => chain);

  return { client: { rpc, from } as unknown as AppSupabaseClient, rpc, from, chain };
}
