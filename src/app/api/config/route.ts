import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { ConfigService } from "@/services/config";

/** GET /api/config: which features are on and whether maintenance mode is active. */
export const GET = apiHandler("GET /api/config", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new ConfigService(supabase).get());
});
