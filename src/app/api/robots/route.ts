import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { RobotService } from "@/services/robots";

/** GET /api/robots: the robot shop with prices, rates, limits and what you own. */
export const GET = apiHandler("GET /api/robots", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new RobotService(supabase).shop());
});
