import { requireAdmin } from "@/lib/auth/require-admin";
import { parseRecordId, readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { achievementInputSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** PATCH /api/admin/achievements/:id — update a badge (full representation). */
export const PATCH = apiHandler(
  "PATCH /api/admin/achievements/:id",
  async (request: Request, ctx: RouteContext<"/api/admin/achievements/[id]">) => {
    const { supabase } = await requireAdmin();
    const id = parseRecordId((await ctx.params).id);
    const input = await readAdminBody(request, achievementInputSchema);
    return json(await new AdminService(supabase).saveAchievement(id, input));
  },
);
