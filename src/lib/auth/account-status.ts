import "server-only";
import { cache } from "react";
import type { AccountStatus } from "@/lib/validation/admin";
import { AccountService } from "@/services/account";
import { requireUser } from "./require-user";

/**
 * The signed-in player's role and suspension state, fetched once per request
 * however many components ask. Null when signed out. For display only: every
 * protected operation is authorized again by the database.
 */
export const getAccountStatus = cache(async (): Promise<AccountStatus | null> => {
  const { supabase, user } = await requireUser();
  if (!user) return null;
  return new AccountService(supabase).getStatus();
});
