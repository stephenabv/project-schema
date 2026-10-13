import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { idempotentRequestSchema } from "@/lib/validation/engagement";
import { BonusService } from "@/services/bonus";

/** GET /api/daily-bonus: today's check-in state and the next reward. */
export const GET = apiHandler("GET /api/daily-bonus", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new BonusService(supabase).status());
});

/**
 * POST /api/daily-bonus  { idempotencyKey }
 * Claims today's bonus once per UTC day. The database decides the streak
 * and the amount.
 */
export const POST = apiHandler("POST /api/daily-bonus", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const body = idempotentRequestSchema.safeParse(await readJsonBody(request));
  if (!body.success) throw new ValidationError("A valid idempotency key is required");
  return json(await new BonusService(supabase).claim(body.data.idempotencyKey));
});
