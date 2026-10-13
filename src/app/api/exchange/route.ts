import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { RedemptionService } from "@/services/redemption";

/** GET /api/exchange: whether conversion is enabled, the current rate, limits and your balances. */
export const GET = apiHandler("GET /api/exchange", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new RedemptionService(supabase).overview());
});
