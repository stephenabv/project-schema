import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { ShopService } from "@/services/shop";

/** GET /api/shop: cosmetic items with prices in virtual coins and the caller's ownership. */
export const GET = apiHandler("GET /api/shop", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new ShopService(supabase).list());
});
