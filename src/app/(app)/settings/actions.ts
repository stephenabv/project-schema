"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/auth/form-state";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { changePasswordSchema, fieldErrorsOf } from "@/lib/validation/auth";
import { ProfileService } from "@/services/profile";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Changes the password after re-verifying the current one, so a hijacked
 * session alone cannot lock the owner out.
 */
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: text(formData, "currentPassword"),
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };

  const { supabase, user } = await requireUser();
  if (!user?.email) return { status: "error", message: "Your session has ended. Please sign in again." };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return { status: "error", fieldErrors: { currentPassword: "Your current password is incorrect" } };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("password_change_failed", { code: error.code ?? "unknown" });
    return { status: "error", message: "Unable to change your password. Please try again." };
  }

  return { status: "success", message: "Password changed." };
}

/** Revokes every session for this account (all devices), then returns to login. */
export async function signOutEverywhere(): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) logger.warn("global_sign_out_failed", { code: error.code ?? "unknown" });
  redirect("/login");
}

/** Hides or shows the player on public leaderboards (form field `optOut` = "true" | "false"). */
export async function setLeaderboardVisibility(formData: FormData): Promise<void> {
  const optOut = text(formData, "optOut");
  if (optOut !== "true" && optOut !== "false") return;

  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/settings");

  try {
    await new ProfileService(supabase).setLeaderboardOptOut(user.id, optOut === "true");
  } catch (error) {
    logger.warn("leaderboard_opt_out_failed", { code: error instanceof AppError ? error.code : "unknown" });
  }
  refresh();
}
