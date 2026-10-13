import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseRecordId, readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { AdminService } from "@/services/admin";

const isoOrNull = z.iso.datetime({ offset: true }).nullable();
const bodySchema = z
  .strictObject({ publishAt: isoOrNull, unpublishAt: isoOrNull })
  .refine((v) => !v.publishAt || !v.unpublishAt || Date.parse(v.unpublishAt) > Date.parse(v.publishAt), {
    message: "The end must be after the start",
    path: ["unpublishAt"],
  });

/**
 * PUT /api/admin/tasks/:id/schedule { publishAt, unpublishAt }
 * ISO timestamps, or null for no limit. A published mission is live only inside its window.
 */
export const PUT = apiHandler(
  "PUT /api/admin/tasks/:id/schedule",
  async (request: Request, ctx: RouteContext<"/api/admin/tasks/[id]/schedule">) => {
    const { supabase } = await requireAdmin();
    const taskId = parseRecordId((await ctx.params).id);
    const input = await readAdminBody(request, bodySchema);
    return json(await new AdminService(supabase).scheduleTask(taskId, input));
  },
);
