import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { ProgressionService } from "@/services/progression";
import type { AchievementsResponse } from "@/types/api";

/** GET /api/achievements: every badge with the caller's progress, plus XP and level. */
export const GET = apiHandler("GET /api/achievements", async () => {
  const { supabase } = await requireAuthenticatedUser();
  const service = new ProgressionService(supabase);
  const [achievements, progression] = await Promise.all([service.listAchievements(), service.get()]);
  return json<AchievementsResponse>({ achievements, progression });
});
