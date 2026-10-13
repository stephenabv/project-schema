import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { idempotentRequestSchema } from "@/lib/validation/engagement";
import { GeneratorService } from "@/services/generator";

/** POST /api/generator/upgrade  { idempotencyKey }: Builds the generator or raises its level for virtual coins (the price comes from the database). */
export const POST = apiHandler("POST /api/generator/upgrade", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const body = idempotentRequestSchema.safeParse(await readJsonBody(request));
  if (!body.success) throw new ValidationError("A valid idempotency key is required");
  return json(await new GeneratorService(supabase).upgrade(body.data.idempotencyKey));
});
