import { getPublicEnv } from "@/lib/env";

/**
 * Auth email links land on `/auth/callback?next=…`. Built from configuration,
 * never from the Host header. The shared Supabase email templates append
 * `&token_hash=…&type=…` to this URL and pick Virtual Earn's branding by its
 * origin (see supabase/templates/shared-project), so it always carries a query.
 */
export function authCallbackUrl(next: string, appUrl: string = getPublicEnv().NEXT_PUBLIC_APP_URL): string {
  const url = new URL("/auth/callback", appUrl);
  url.searchParams.set("next", next);
  return url.toString();
}
