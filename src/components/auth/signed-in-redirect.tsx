"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchSessionStatus } from "@/lib/api/session-client";
import { DEFAULT_AFTER_LOGIN, safeRedirectPath } from "@/lib/auth/redirect";

/**
 * Sends signed-in players from guest pages (landing, sign in, register) into
 * the app. The proxy already redirects full page loads; this covers pages the
 * browser restores from its history cache (back button), which never reach
 * the proxy. It renders nothing and never blocks guests.
 */
export function SignedInRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!(await fetchSessionStatus()) || cancelled) return;
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(safeRedirectPath(next, DEFAULT_AFTER_LOGIN));
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check();
    };

    void check();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
