import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { featureFlagsSchema } from "@/lib/validation/operations";
import { AdminService } from "@/services/admin";

/** PUT /api/admin/settings/flags { dailyBonus, leaderboard, shop, idleGenerator } (all booleans, audited). */
export const PUT = apiHandler("PUT /api/admin/settings/flags", async (request: Request) => {
  const { supabase } = await requireAdmin();
  const flags = await readAdminBody(request, featureFlagsSchema.strict());
  return json({ featureFlags: await new AdminService(supabase).updateFeatureFlags(flags) });
});
