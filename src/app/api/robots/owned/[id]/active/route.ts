import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { robotActiveRequestSchema, robotIdSchema } from "@/lib/validation/robots";
import { RobotService } from "@/services/robots";

/**
 * POST /api/robots/owned/:id/active  { active, idempotencyKey }
 * Activates or deactivates one of your robots. Deactivating pays what it
 * accrued first.
 */
export const POST = apiHandler(
  "POST /api/robots/owned/:id/active",
  async (request: Request, ctx: RouteContext<"/api/robots/owned/[id]/active">) => {
    const { supabase } = await requireAuthenticatedUser();
    const id = robotIdSchema.safeParse((await ctx.params).id);
    if (!id.success) throw new NotFoundError("Robot not found");
    const body = robotActiveRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) throw new ValidationError("Send active (true or false) and a valid idempotency key");
    return json(await new RobotService(supabase).setActive(id.data, body.data.active, body.data.idempotencyKey));
  },
);
