import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { parseBody } from "@/lib/http/validate";
import { conversionRequestSchema } from "@/lib/validation/redemption";
import { RedemptionService } from "@/services/redemption";

/** GET /api/conversions: your conversion requests with their status history. */
export const GET = apiHandler("GET /api/conversions", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json({ items: await new RedemptionService(supabase).conversions() });
});

/**
 * POST /api/conversions  { coins, rateId, idempotencyKey }
 * Reserves virtual coins for conversion at the current rate. rateId is the
 * rate you reviewed; if it changed, the request is refused (RATE_CHANGED).
 * The peso amount is computed by the database.
 */
export const POST = apiHandler("POST /api/conversions", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const input = await parseBody(request, conversionRequestSchema);
  return json(await new RedemptionService(supabase).requestConversion(input), { status: 201 });
});
