import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { accountStatusSchema, type AccountStatus } from "@/lib/validation/admin";
import { parseContract } from "./contract";

/** The signed-in player's role and suspension state, as the database sees it. */
export class AccountService {
  constructor(private readonly db: AppSupabaseClient) {}

  async getStatus(): Promise<AccountStatus> {
    const { data, error } = await this.db.rpc("get_account_status");
    if (error) throw toAppError(error, "get_account_status");
    return parseContract(accountStatusSchema, data, "get_account_status");
  }
}
