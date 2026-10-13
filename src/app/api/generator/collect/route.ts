import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { idempotentRequestSchema } from "@/lib/validation/engagement";
import { GeneratorService } from "@/services/generator";

/** POST /api/generator/collect  { idempotencyKey }: Collects the virtual coins the generator has made (server time decides the amount). */
export const POST = apiHandler("POST /api/generator/collect", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const body = idempotentRequestSchema.safeParse(await readJsonBody(request));
  if (!body.success) throw new ValidationError("A valid idempotency key is required");
  return json(await new GeneratorService(supabase).collect(body.data.idempotencyKey));
});
