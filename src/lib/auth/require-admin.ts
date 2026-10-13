import "server-only";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError } from "@/lib/errors";
import { AccountService } from "@/services/account";
import { requireAuthenticatedUser, requireUser, type AuthenticatedContext } from "./require-user";

/**
 * For admin Route Handlers and Server Actions: the verified user, or 401/403.
 * The ve_admin_* database functions check the role again on every call; this
 * check only stops non-admins before any work is done.
 */
export async function requireAdmin(): Promise<AuthenticatedContext> {
  const context = await requireAuthenticatedUser();
  const status = await new AccountService(context.supabase).getStatus();
  if (!status.isAdmin) throw new ForbiddenError("Administrator role required");
  return context;
}

/**
 * For admin pages: signed-out visitors go to login; signed-in non-admins get a
 * 404 so the console's existence is not advertised.
 */
export async function getAdminOrNotFound(nextPath: string): Promise<AuthenticatedContext> {
  const { supabase, user } = await requireUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const status = await new AccountService(supabase).getStatus();
  if (!status.isAdmin) notFound();
  return { supabase, user };
}
