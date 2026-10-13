import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { NotificationService } from "@/services/notifications";

/** GET /api/notifications: the caller's newest notifications and the unread count. */
export const GET = apiHandler("GET /api/notifications", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json(await new NotificationService(supabase).list());
});
