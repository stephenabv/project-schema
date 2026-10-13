import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { GeneratorService } from "@/services/generator";

/** GET /api/generator: level, rate, coins waiting to be collected and the next upgrade price. */
export const GET = apiHandler("GET /api/generator", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new GeneratorService(supabase).status());
});
