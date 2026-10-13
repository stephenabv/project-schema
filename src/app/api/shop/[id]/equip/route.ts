import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { equipRequestSchema, shopItemIdSchema } from "@/lib/validation/engagement";
import { ShopService } from "@/services/shop";

/** POST /api/shop/:id/equip  { equip }: equips (one per category) or unequips an owned item. */
export const POST = apiHandler(
  "POST /api/shop/:id/equip",
  async (request: Request, ctx: RouteContext<"/api/shop/[id]/equip">) => {
    const { supabase } = await requireAuthenticatedUser();

    const itemId = shopItemIdSchema.safeParse((await ctx.params).id);
    if (!itemId.success) throw new NotFoundError("This item is not available");

    const body = equipRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) throw new ValidationError("Send { \"equip\": true } or { \"equip\": false }");

    return json(await new ShopService(supabase).equip(itemId.data, body.data.equip));
  },
);
