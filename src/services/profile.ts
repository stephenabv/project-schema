import "server-only";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { AVATAR_KEYS, type ProfileUpdate } from "@/lib/validation/profile";
import { parseContract } from "./contract";

const profileRowSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  avatar_key: z.enum(AVATAR_KEYS),
  created_at: z.string(),
});

export interface PlayerProfile {
  id: string;
  username: string;
  avatarKey: (typeof AVATAR_KEYS)[number];
  createdAt: string;
}

/**
 * The caller's own profile. RLS limits reads and updates to the signed-in
 * user, and column grants limit updates to username and avatar.
 */
export class ProfileService {
  constructor(private readonly db: AppSupabaseClient) {}

  async get(userId: string): Promise<PlayerProfile> {
    const { data, error } = await this.db
      .from("player_profiles")
      .select("id, username, avatar_key, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw toAppError(error, "get_profile");
    if (!data) throw new NotFoundError("Profile not found");
    return this.toProfile(data);
  }

  async update(userId: string, input: ProfileUpdate): Promise<PlayerProfile> {
    const { data, error } = await this.db
      .from("player_profiles")
      .update({ username: input.username, avatar_key: input.avatarKey })
      .eq("id", userId)
      .select("id, username, avatar_key, created_at")
      .maybeSingle();
    if (error) throw toAppError(error, "update_profile");
    if (!data) throw new NotFoundError("Profile not found");
    return this.toProfile(data);
  }

  private toProfile(row: unknown): PlayerProfile {
    const parsed = parseContract(profileRowSchema, row, "profile_row");
    return { id: parsed.id, username: parsed.username, avatarKey: parsed.avatar_key, createdAt: parsed.created_at };
  }
}
