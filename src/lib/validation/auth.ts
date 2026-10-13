import { z } from "zod";

/** Must match the CHECK constraint on public.player_profiles.username. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));

/** bcrypt (used by Supabase Auth) only reads the first 72 bytes. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_PATTERN, "Use 3-24 letters, numbers or underscores");

export const loginSchema = z.object({
  email: emailSchema,
  // Login only checks presence; strength rules apply when a password is set.
  password: z.string().min(1, "Enter your password").max(72),
});

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  acknowledgeVirtual: z.literal("on", {
    error: "Please confirm you understand coins are virtual and have no monetary value",
  }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords do not match",
  });

export type FieldErrors = Partial<Record<string, string>>;

/** First error message per field, suitable for rendering next to inputs. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(72),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords do not match",
  })
  .refine((value) => value.password !== value.currentPassword, {
    path: ["password"],
    error: "Choose a password you are not already using",
  });
