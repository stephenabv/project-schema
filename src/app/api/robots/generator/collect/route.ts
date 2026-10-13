import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { idempotentRequestSchema } from "@/lib/validation/engagement";
import { RobotService } from "@/services/robots";

/** POST /api/robots/generator/collect  { idempotencyKey }: pays what every active robot accrued by server time. */
export const POST = apiHandler("POST /api/robots/generator/collect", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const body = idempotentRequestSchema.safeParse(await readJsonBody(request));
  if (!body.success) throw new ValidationError("A valid idempotency key is required");
  return json(await new RobotService(supabase).collect(body.data.idempotencyKey));
});
