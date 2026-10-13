import { requireAdmin } from "@/lib/auth/require-admin";
import { parseRecordId, readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { taskInputSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** PATCH /api/admin/tasks/:id — update, publish or archive a mission (full representation). */
export const PATCH = apiHandler(
  "PATCH /api/admin/tasks/:id",
  async (request: Request, ctx: RouteContext<"/api/admin/tasks/[id]">) => {
    const { supabase } = await requireAdmin();
    const taskId = parseRecordId((await ctx.params).id);
    const input = await readAdminBody(request, taskInputSchema);
    return json(await new AdminService(supabase).saveTask(taskId, input));
  },
);
