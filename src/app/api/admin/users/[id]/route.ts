import { requireAdmin } from "@/lib/auth/require-admin";
import { parseRecordId, readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { userActionSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/**
 * PATCH /api/admin/users/:id
 * { action: "suspend", reason } | { action: "restore" } | { action: "set_role", role }
 */
export const PATCH = apiHandler(
  "PATCH /api/admin/users/:id",
  async (request: Request, ctx: RouteContext<"/api/admin/users/[id]">) => {
    const { supabase } = await requireAdmin();
    const userId = parseRecordId((await ctx.params).id);
    const action = await readAdminBody(request, userActionSchema);
    await new AdminService(supabase).applyUserAction(userId, action);
    return json({ success: true });
  },
);
