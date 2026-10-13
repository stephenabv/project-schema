import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdminBody } from "@/lib/http/admin";
import { apiHandler, json } from "@/lib/http/api";
import { maintenanceInputSchema } from "@/lib/validation/operations";
import { AdminService } from "@/services/admin";

/** PUT /api/admin/settings/maintenance { enabled, message }: pauses or resumes earning and spending (audited). */
export const PUT = apiHandler("PUT /api/admin/settings/maintenance", async (request: Request) => {
  const { supabase } = await requireAdmin();
  const input = await readAdminBody(request, maintenanceInputSchema);
  return json({ maintenance: await new AdminService(supabase).setMaintenance(input) });
});
