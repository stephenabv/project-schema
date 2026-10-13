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
  leaderboard_opt_out: z.boolean(),
});

const PROFILE_COLUMNS = "id, username, avatar_key, created_at, leaderboard_opt_out";

export interface PlayerProfile {
  id: string;
  username: string;
  avatarKey: (typeof AVATAR_KEYS)[number];
  createdAt: string;
  leaderboardOptOut: boolean;
}

/**
 * The caller's own profile. RLS limits reads and updates to the signed-in
 * user, and column grants limit updates to username, avatar and the
 * leaderboard opt-out.
 */
export class ProfileService {
  constructor(private readonly db: AppSupabaseClient) {}

  async get(userId: string): Promise<PlayerProfile> {
    const { data, error } = await this.db
      .from("player_profiles")
      .select(PROFILE_COLUMNS)
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
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) throw toAppError(error, "update_profile");
    if (!data) throw new NotFoundError("Profile not found");
    return this.toProfile(data);
  }

  /** Hides (or shows) the player on public leaderboards. */
  async setLeaderboardOptOut(userId: string, optOut: boolean): Promise<PlayerProfile> {
    const { data, error } = await this.db
      .from("player_profiles")
      .update({ leaderboard_opt_out: optOut })
      .eq("id", userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) throw toAppError(error, "set_leaderboard_opt_out");
    if (!data) throw new NotFoundError("Profile not found");
    return this.toProfile(data);
  }

  private toProfile(row: unknown): PlayerProfile {
    const parsed = parseContract(profileRowSchema, row, "profile_row");
    return {
      id: parsed.id,
      username: parsed.username,
      avatarKey: parsed.avatar_key,
      createdAt: parsed.created_at,
      leaderboardOptOut: parsed.leaderboard_opt_out,
    };
  }
}
