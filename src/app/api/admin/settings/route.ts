import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { tapPolicyInputSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** GET /api/admin/settings — the live tap policy and who changed it last. */
export const GET = apiHandler("GET /api/admin/settings", async () => {
  const { supabase } = await requireAdmin();
  return json(await new AdminService(supabase).getSettings());
});

/** PATCH /api/admin/settings { rewardCoins, cooldownMs, dailyLimit, xpPerTap } */
export const PATCH = apiHandler("PATCH /api/admin/settings", async (request: Request) => {
  const { supabase } = await requireAdmin();
  const policy = await readAdminBody(request, tapPolicyInputSchema);
  return json({ tapPolicy: await new AdminService(supabase).updateTapPolicy(policy) });
});
