import { z } from "zod";
import { usernameSchema } from "./auth";

/** Preset avatars. Must match the CHECK constraint on player_profiles.avatar_key. */
export const AVATAR_KEYS = ["coins", "rocket", "star", "leaf", "flame", "crown", "gem", "zap"] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  avatarKey: z.enum(AVATAR_KEYS, "Choose one of the avatars"),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
