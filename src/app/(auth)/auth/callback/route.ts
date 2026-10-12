import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Completes email confirmation and password recovery. Supports both the PKCE
 * `code` flow and the `token_hash` email-template flow. `next` is restricted
 * to same-origin paths.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) logger.warn("auth_callback_failed", { flow: "pkce", code: error.code ?? "unknown" });
  } else if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
    if (error) logger.warn("auth_callback_failed", { flow: "otp", code: error.code ?? "unknown" });
  }

  const destination = request.nextUrl.clone();
  destination.search = "";
  if (ok) {
    const target = new URL(next, request.nextUrl.origin);
    destination.pathname = target.pathname;
    destination.search = target.search;
  } else {
    destination.pathname = "/login";
    destination.searchParams.set("error", "link_invalid");
  }
  return NextResponse.redirect(destination);
}
