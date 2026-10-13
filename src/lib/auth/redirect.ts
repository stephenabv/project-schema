export const DEFAULT_AFTER_LOGIN = "/dashboard";

/**
 * Accepts only same-origin relative paths for post-login redirects, which
 * prevents open redirects through the `next` parameter.
 */
export function safeRedirectPath(next: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  // Reject control characters, which some browsers strip to form "//".
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  try {
    const url = new URL(next, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
