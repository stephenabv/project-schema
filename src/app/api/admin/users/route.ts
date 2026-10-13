import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { apiHandler, json } from "@/lib/http/api";
import { userQuerySchema } from "@/lib/validation/admin";
import { AdminService } from "@/services/admin";

/** GET /api/admin/users?q=&page= — search players by username, email or id. */
export const GET = apiHandler("GET /api/admin/users", async (request: NextRequest) => {
  const { supabase } = await requireAdmin();
  const { q, page } = userQuerySchema.parse({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
  });
  return json(await new AdminService(supabase).listUsers(q || undefined, page));
});
