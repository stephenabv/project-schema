import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { apiHandler, json } from "@/lib/http/api";
import { AdminService } from "@/services/admin";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(90).catch(30) });

/** GET /api/admin/analytics?days=30 — platform metrics, daily series and flagged players. */
export const GET = apiHandler("GET /api/admin/analytics", async (request: NextRequest) => {
  const { supabase } = await requireAdmin();
  const { days } = querySchema.parse({ days: request.nextUrl.searchParams.get("days") ?? undefined });
  const admin = new AdminService(supabase);
  const [overview, series, suspicious] = await Promise.all([
    admin.overview(),
    admin.activitySeries(days),
    admin.suspiciousActivity(Math.min(days, 30)),
  ]);
  return json({ overview, series, suspicious });
});
