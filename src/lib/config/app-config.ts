import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { DEFAULT_APP_CONFIG, type AppConfig } from "@/lib/validation/operations";
import { ConfigService } from "@/services/config";

/**
 * Feature flags and maintenance state for rendering, fetched once per
 * request. Display only: if it cannot be read the UI shows every feature,
 * and the database still enforces the real flags on every reward.
 */
export const getAppConfig = cache(async (): Promise<AppConfig> => {
  const { supabase, user } = await requireUser();
  if (!user) return DEFAULT_APP_CONFIG;
  try {
    return await new ConfigService(supabase).get();
  } catch (error) {
    logger.warn("app_config_unavailable", { code: error instanceof AppError ? error.code : "unknown" });
    return DEFAULT_APP_CONFIG;
  }
});
