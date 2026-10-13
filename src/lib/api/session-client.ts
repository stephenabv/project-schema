import type { SessionStatus } from "@/types/api";

/**
 * Asks the server whether the browser holds a valid session. Any failure is
 * reported as signed out, so a network error never redirects anyone.
 */
export async function fetchSessionStatus(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return false;
    const body = (await response.json()) as Partial<SessionStatus>;
    return body.authenticated === true;
  } catch {
    return false;
  }
}
