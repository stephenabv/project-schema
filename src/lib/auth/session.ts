import "server-only";
import { redirect } from "next/navigation";
import { requireUser, type AuthenticatedContext } from "./require-user";

/**
 * For Server Components in the signed-in area: returns the verified user or
 * redirects to the login page. Must be called inside a <Suspense> boundary
 * because it reads request cookies.
 */
export async function getSessionOrRedirect(nextPath: string): Promise<AuthenticatedContext> {
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { supabase, user };
}
