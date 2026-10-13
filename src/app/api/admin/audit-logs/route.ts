import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { apiHandler, json } from "@/lib/http/api";
import { auditQuerySchema } from "@/lib/validation/admin";
import { queryRecord } from "@/lib/validation/transactions";
import { AdminService } from "@/services/admin";

/** GET /api/admin/audit-logs?action=&target=&from=&to=&cursor= — newest first, keyset paginated. */
export const GET = apiHandler("GET /api/admin/audit-logs", async (request: NextRequest) => {
  const { supabase } = await requireAdmin();
  const query = auditQuerySchema.parse(queryRecord(request.nextUrl.searchParams));
  return json(await new AdminService(supabase).listAuditLogs(query));
});
