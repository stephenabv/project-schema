import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * User-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. It acts with the caller's session, so RLS applies. Create a
 * new client per request.
 */
export async function createClient(): Promise<AppSupabaseClient> {
  // Session handling reads the clock (token expiry), so it must never run
  // during a (runtime) prerender: wait for the actual request first.
  await connection();
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The request proxy refreshes the session cookies instead.
        }
      },
    },
  });
}
