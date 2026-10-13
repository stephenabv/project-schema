import { requireUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import type { SessionStatus } from "@/types/api";

/**
 * GET /api/auth/session: whether the request carries a session the Auth
 * server accepts. It returns no identity, only a flag the guest pages use to
 * send signed-in players back to the app after a back/forward navigation.
 */
export const GET = apiHandler("GET /api/auth/session", async () => {
  const { user } = await requireUser();
  return json<SessionStatus>({ authenticated: user !== null });
});
