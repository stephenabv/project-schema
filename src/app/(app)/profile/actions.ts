"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/auth/form-state";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { fieldErrorsOf } from "@/lib/validation/auth";
import { profileUpdateSchema } from "@/lib/validation/profile";
import { ProfileService } from "@/services/profile";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Updates the signed-in player's username and avatar. Identity comes from the session only. */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { username: text(formData, "username"), avatarKey: text(formData, "avatarKey") };
  const parsed = profileUpdateSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { status: "error", message: "Your session has ended. Please sign in again.", values };

  try {
    await new ProfileService(supabase).update(user.id, parsed.data);
  } catch (error) {
    if (error instanceof AppError && error.code === "USERNAME_TAKEN") {
      return { status: "error", fieldErrors: { username: "That username is already taken" }, values };
    }
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      return { status: "error", message: "Please check your details and try again.", values };
    }
    logger.error("profile_update_failed", { code: error instanceof AppError ? error.code : "unknown" });
    return { status: "error", message: "Unable to save your profile. Please try again.", values };
  }

  revalidatePath("/profile");
  return { status: "success", message: "Profile saved.", values: parsed.data };
}
