import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { appConfigSchema, type AppConfig } from "@/lib/validation/operations";
import { parseContract } from "./contract";

/** Feature flags and maintenance state, as admins configured them. */
export class ConfigService {
  constructor(private readonly db: AppSupabaseClient) {}

  async get(): Promise<AppConfig> {
    const { data, error } = await this.db.rpc("get_app_config");
    if (error) throw toAppError(error, "get_app_config");
    return parseContract(appConfigSchema, data, "get_app_config");
  }
}
