import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Virtual Earn"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

let cached: PublicEnv | undefined;

/**
 * Validated public configuration. Each variable is referenced literally so
 * Next.js can inline it. Fails fast with the names (never the values) of
 * misconfigured variables.
 */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const parsed = PublicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || undefined,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });

  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}. See .env.example.`);
  }

  cached = parsed.data;
  return cached;
}
