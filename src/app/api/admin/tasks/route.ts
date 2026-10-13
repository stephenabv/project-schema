import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { taskInputSchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** GET /api/admin/tasks — every mission, including drafts and archived ones. */
export const GET = apiHandler("GET /api/admin/tasks", async () => {
  const { supabase } = await requireAdmin();
  return json({ tasks: await new AdminService(supabase).listTasks() });
});

/** POST /api/admin/tasks — create a mission. */
export const POST = apiHandler("POST /api/admin/tasks", async (request: Request) => {
  const { supabase } = await requireAdmin();
  const input = await readAdminBody(request, taskInputSchema);
  return json(await new AdminService(supabase).saveTask(null, input), { status: 201 });
});
