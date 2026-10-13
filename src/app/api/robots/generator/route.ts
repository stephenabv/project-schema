import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { RobotService } from "@/services/robots";

/** GET /api/robots/generator: owned robots, their accrued coins (by server time) and totals. */
export const GET = apiHandler("GET /api/robots/generator", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new RobotService(supabase).generator());
});
