"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { fetchSessionStatus } from "@/lib/api/session-client";

/**
 * Public header call to action: "Sign in" for guests, "Open app" for players
 * who are already signed in, so they are never sent back to the login form.
 */
export function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionStatus().then((value) => {
      if (!cancelled) setSignedIn(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return signedIn ? (
    <ButtonLink href="/dashboard">Open app</ButtonLink>
  ) : (
    <ButtonLink href="/login" variant="secondary">
      Sign in
    </ButtonLink>
  );
}
