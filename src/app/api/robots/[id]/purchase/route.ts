import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { idempotentRequestSchema } from "@/lib/validation/engagement";
import { robotIdSchema } from "@/lib/validation/robots";
import { RobotService } from "@/services/robots";

/**
 * POST /api/robots/:id/purchase  { idempotencyKey }
 * Buys a robot with virtual coins. Price, limits and balance are checked by
 * the database; the client never sends an amount.
 */
export const POST = apiHandler(
  "POST /api/robots/:id/purchase",
  async (request: Request, ctx: RouteContext<"/api/robots/[id]/purchase">) => {
    const { supabase } = await requireAuthenticatedUser();
    const robotId = robotIdSchema.safeParse((await ctx.params).id);
    if (!robotId.success) throw new NotFoundError("This robot is not available");
    const body = idempotentRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) throw new ValidationError("A valid idempotency key is required");
    return json(await new RobotService(supabase).purchase(robotId.data, body.data.idempotencyKey));
  },
);
