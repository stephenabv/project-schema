import { requireAdmin } from "@/lib/auth/require-admin";
import { parseRecordId, readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { adjustmentInputSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** POST /api/admin/users/:id/adjustments { amountCoins, reason, idempotencyKey } — virtual coins only. */
export const POST = apiHandler(
  "POST /api/admin/users/:id/adjustments",
  async (request: Request, ctx: RouteContext<"/api/admin/users/[id]/adjustments">) => {
    const { supabase } = await requireAdmin();
    const userId = parseRecordId((await ctx.params).id);
    const input = await readAdminBody(request, adjustmentInputSchema);
    return json(await new AdminService(supabase).adjustBalance(userId, input));
  },
);
