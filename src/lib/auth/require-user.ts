import "server-only";
import type { User } from "@supabase/supabase-js";
import { AuthenticationError } from "@/lib/errors";
import { createClient, type AppSupabaseClient } from "@/lib/supabase/server";

export interface AuthenticatedContext {
  supabase: AppSupabaseClient;
  user: User;
}

/**
 * Returns the user-scoped client and the user verified with the Auth server
 * (getUser), never a client-supplied id. `user` is null when signed out.
 */
export async function requireUser(): Promise<{ supabase: AppSupabaseClient; user: User | null }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { supabase, user: null };
  return { supabase, user };
}

/** Like requireUser, but throws AuthenticationError (HTTP 401) when signed out. */
export async function requireAuthenticatedUser(): Promise<AuthenticatedContext> {
  const { supabase, user } = await requireUser();
  if (!user) throw new AuthenticationError();
  return { supabase, user };
}
