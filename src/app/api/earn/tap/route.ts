import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { tapRequestSchema } from "@/lib/validation/earn";
import { RewardService } from "@/services/rewards";

/**
 * POST /api/earn/tap
 * Body: { "idempotencyKey": "<uuid>" }. The reward amount is decided by the
 * database; retries with the same key return the original result.
 */
export const POST = apiHandler("POST /api/earn/tap", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();

  const parsed = tapRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw new ValidationError("A valid idempotency key is required");

  const result = await new RewardService(supabase).processTap(parsed.data.idempotencyKey);
  return json(result);
});
