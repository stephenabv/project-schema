import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json, readJsonBody } from "@/lib/http/api";
import { markReadRequestSchema } from "@/lib/validation/engagement";
import { NotificationService } from "@/services/notifications";

/** Fits 100 uuids plus JSON punctuation. */
const MAX_BODY_BYTES = 4096;

/** POST /api/notifications/read  { ids? }: marks the given notifications (or all) read. */
export const POST = apiHandler("POST /api/notifications/read", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const body = markReadRequestSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!body.success) throw new ValidationError("Send up to 100 notification ids, or none to mark all read");
  const marked = await new NotificationService(supabase).markRead(body.data.ids);
  return json({ marked });
});
