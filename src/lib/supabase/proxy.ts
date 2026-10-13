import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_AFTER_LOGIN, safeRedirectPath } from "@/lib/auth/redirect";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/earn",
  "/missions",
  "/achievements",
  "/wallet",
  "/profile",
  "/settings",
  "/leaderboard",
  "/shop",
  "/notifications",
  "/generator",
  "/robots",
  "/exchange",
  "/payouts",
  "/admin",
];
const GUEST_ONLY_PATHS = ["/login", "/register"];
/** The landing page only invites guests to sign up or sign in. */
const GUEST_ONLY_EXACT = ["/"];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase session cookies on every request and performs
 * optimistic redirects. This is a UX convenience only: every page, Server
 * Action and Route Handler still verifies the user itself.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser(): it refreshes
  // the session and must see the request cookies untouched.
  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getUser();
    isAuthenticated = Boolean(data.user);
  } catch {
    // Auth service unreachable: treat as signed out; handlers re-verify.
    isAuthenticated = false;
  }

  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && matches(pathname, PROTECTED_PREFIXES)) {
    return redirectPreservingCookies(request, response, "/login", { next: `${pathname}${search}` });
  }

  if (isAuthenticated && (GUEST_ONLY_EXACT.includes(pathname) || matches(pathname, GUEST_ONLY_PATHS))) {
    // Honour a validated ?next= so a signed-in player lands where they were headed.
    const target = safeRedirectPath(request.nextUrl.searchParams.get("next"), DEFAULT_AFTER_LOGIN);
    return redirectPreservingCookies(request, response, target);
  }

  return response;
}

function redirectPreservingCookies(
  request: NextRequest,
  source: NextResponse,
  target: string,
  params: Record<string, string> = {},
): NextResponse {
  // `target` may carry its own query string (a validated ?next= value).
  const url = new URL(target, request.nextUrl.origin);
  const extra = new URLSearchParams(params);
  extra.forEach((value, key) => url.searchParams.set(key, value));
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
