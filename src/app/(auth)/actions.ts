"use server";

import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/redirect";
import type { FormState } from "@/lib/auth/form-state";
import { getPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import {
  fieldErrorsOf,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

// Server Actions are public HTTP endpoints: every action validates its own
// input and derives identity from the session, never from form fields.

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Callback URLs are built from configuration, never from the Host header. */
function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", getPublicEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  const parsed = loginSchema.safeParse({ email, password: text(formData, "password") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // One message for every failure so the form does not reveal which emails exist.
    return {
      status: "error",
      message: "Invalid email or password, or the email is not confirmed yet.",
      values: { email },
    };
  }

  redirect(safeRedirectPath(text(formData, "next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: text(formData, "email"), username: text(formData, "username") };
  const parsed = registerSchema.safeParse({
    ...values,
    password: text(formData, "password"),
    acknowledgeVirtual: formData.get("acknowledgeVirtual") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Only the username is passed as metadata; roles are never client-controlled.
      data: { username: parsed.data.username },
      emailRedirectTo: callbackUrl("/dashboard"),
    },
  });

  if (error) {
    logger.warn("signup_failed", { code: error.code ?? "unknown" });
    return { status: "error", message: "Unable to create account. Please check your details.", values };
  }

  if (data.session) redirect("/dashboard");

  return {
    status: "success",
    message: "Check your inbox to confirm your email address, then sign in.",
  };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl("/reset-password"),
  });
  if (error) logger.warn("password_reset_request_failed", { code: error.code ?? "unknown" });

  // Same response whether or not the account exists.
  return {
    status: "success",
    message: "If an account exists for that email, a reset link is on its way.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Your reset link has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("password_update_failed", { code: error.code ?? "unknown" });
    return { status: "error", message: "Unable to update your password. Please try again." };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
