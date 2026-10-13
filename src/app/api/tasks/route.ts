import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { MissionService } from "@/services/missions";
import type { MissionsResponse } from "@/types/api";

/** GET /api/tasks: published missions with the caller's progress for the current period. */
export const GET = apiHandler("GET /api/tasks", async () => {
  const { supabase } = await requireAuthenticatedUser();
  const missions = await new MissionService(supabase).list();
  return json<MissionsResponse>({ missions, currency: "VC", redeemable: false });
});
