import "server-only";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { leaderboardSchema, type Leaderboard, type LeaderboardKind } from "@/lib/validation/engagement";
import { parseContract } from "./contract";

export const LEADERBOARD_SIZE = 25;

/**
 * Public rankings. The database function returns only display fields
 * (username, avatar, level, score, cosmetics) and skips players who opted
 * out or are suspended, so no private data crosses accounts.
 */
export class LeaderboardService {
  constructor(private readonly db: AppSupabaseClient) {}

  async get(board: LeaderboardKind, limit: number = LEADERBOARD_SIZE): Promise<Leaderboard> {
    const { data, error } = await this.db.rpc("get_leaderboard", { p_board: board, p_limit: limit });
    if (error) throw toAppError(error, "get_leaderboard");
    return parseContract(leaderboardSchema, data, "get_leaderboard");
  }
}
