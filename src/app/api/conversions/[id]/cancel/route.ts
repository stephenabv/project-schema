import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError } from "@/lib/errors";
import { apiHandler, json } from "@/lib/http/api";
import { requestIdSchema } from "@/lib/validation/redemption";
import { RedemptionService } from "@/services/redemption";

/** POST /api/conversions/:id/cancel: cancels a pending request and returns the reserved coins. */
export const POST = apiHandler(
  "POST /api/conversions/:id/cancel",
  async (_request: Request, ctx: RouteContext<"/api/conversions/[id]/cancel">) => {
    const { supabase } = await requireAuthenticatedUser();
    const id = requestIdSchema.safeParse((await ctx.params).id);
    if (!id.success) throw new NotFoundError("Request not found");
    return json(await new RedemptionService(supabase).cancelConversion(id.data));
  },
);
