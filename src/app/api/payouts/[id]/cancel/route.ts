import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, json } from "@/lib/http/api";
import { requestIdSchema } from "@/lib/validation/redemption";
import { RedemptionService } from "@/services/redemption";

/** POST /api/payouts/:id/cancel: cancels a pending payout and returns the amount to your approved balance. */
export const POST = apiHandler(
  "POST /api/payouts/:id/cancel",
  async (_request: Request, ctx: RouteContext<"/api/payouts/[id]/cancel">) => {
    const { supabase } = await requireAuthenticatedUser();
    const id = requestIdSchema.safeParse((await ctx.params).id);
    if (!id.success) throw new NotFoundError("Request not found");
    return json(await new RedemptionService(supabase).cancelPayout(id.data));
  },
);
