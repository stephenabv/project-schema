import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { claimRequestSchema, taskIdSchema } from "@/lib/validation/missions";
import { MissionService } from "@/services/missions";
import type { ClaimResponse } from "@/types/api";

/**
 * POST /api/tasks/:id/claim  { idempotencyKey }
 * Claims a mission reward. The database checks the objective, the period and
 * duplicates; the client never supplies an amount.
 */
export const POST = apiHandler(
  "POST /api/tasks/:id/claim",
  async (request: Request, ctx: RouteContext<"/api/tasks/[id]/claim">) => {
    const { supabase } = await requireAuthenticatedUser();

    const taskId = taskIdSchema.safeParse((await ctx.params).id);
    if (!taskId.success) throw new NotFoundError("This mission is not available");

    const body = claimRequestSchema.safeParse(await readJsonBody(request));
    if (!body.success) throw new ValidationError("A valid idempotency key is required");

    return json<ClaimResponse>(await new MissionService(supabase).claim(taskId.data, body.data.idempotencyKey));
  },
);
