import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { DashboardService } from "@/services/dashboard";
import { ProgressionService } from "@/services/progression";
import type { DashboardResponse } from "@/types/api";

/** GET /api/dashboard: summary figures, XP/level progress and the daily reward series. */
export const GET = apiHandler("GET /api/dashboard", async () => {
  const { supabase } = await requireAuthenticatedUser();
  const dashboard = new DashboardService(supabase);
  const [summary, series, progression] = await Promise.all([
    dashboard.getSummary(),
    dashboard.getRewardSeries(),
    new ProgressionService(supabase).get(),
  ]);
  return json<DashboardResponse>({ summary, series, progression });
});
