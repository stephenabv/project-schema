import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { RedemptionService } from "@/services/redemption";

/** GET /api/earnings: tap vs robot earnings, reserved coins and peso request totals. */
export const GET = apiHandler("GET /api/earnings", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new RedemptionService(supabase).breakdown());
});
