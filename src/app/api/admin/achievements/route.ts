import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { achievementInputSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** GET /api/admin/achievements — every badge with its unlock count. */
export const GET = apiHandler("GET /api/admin/achievements", async () => {
  const { supabase } = await requireAdmin();
  return json({ achievements: await new AdminService(supabase).listAchievements() });
});

/** POST /api/admin/achievements — create a badge. */
export const POST = apiHandler("POST /api/admin/achievements", async (request: Request) => {
  const { supabase } = await requireAdmin();
  const input = await readAdminBody(request, achievementInputSchema);
  return json(await new AdminService(supabase).saveAchievement(null, input), { status: 201 });
});
