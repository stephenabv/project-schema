import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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
  "/admin",
];
const GUEST_ONLY_PATHS = ["/login", "/register"];

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

  if (isAuthenticated && matches(pathname, GUEST_ONLY_PATHS)) {
    return redirectPreservingCookies(request, response, "/dashboard");
  }

  return response;
}

function redirectPreservingCookies(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
  params: Record<string, string> = {},
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = new URLSearchParams(params).toString();
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
