import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { idempotentRequestSchema, shopItemIdSchema } from "@/lib/validation/engagement";
import { ShopService } from "@/services/shop";

/**
 * POST /api/shop/:id/purchase  { idempotencyKey }
 * Spends virtual coins on a cosmetic. The price comes from the database,
 * never from the client.
 */
export const POST = apiHandler(
  "POST /api/shop/:id/purchase",
  async (request: Request, ctx: RouteContext<"/api/shop/[id]/purchase">) => {
    const { supabase } = await requireAuthenticatedUser();

    const itemId = shopItemIdSchema.safeParse((await ctx.params).id);
    if (!itemId.success) throw new NotFoundError("This item is not available");

    const body = idempotentRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) throw new ValidationError("A valid idempotency key is required");

    return json(await new ShopService(supabase).purchase(itemId.data, body.data.idempotencyKey));
  },
);
