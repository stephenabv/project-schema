import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { leaderboardQuerySchema } from "@/lib/validation/engagement";
import { LeaderboardService } from "@/services/leaderboard";

/** GET /api/leaderboard?board=xp|weekly: the top players and the caller's own rank. */
export const GET = apiHandler("GET /api/leaderboard", async (request: NextRequest) => {
  const { supabase } = await requireAuthenticatedUser();
  const board = leaderboardQuerySchema.parse(request.nextUrl.searchParams.get("board") ?? undefined);
  return json(await new LeaderboardService(supabase).get(board));
});
