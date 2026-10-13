import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { FeatureDisabledError } from "@/lib/errors";
import { apiHandler, json } from "@/lib/http/api";
import { leaderboardQuerySchema } from "@/lib/validation/engagement";
import { ConfigService } from "@/services/config";
import { LeaderboardService } from "@/services/leaderboard";

/** GET /api/leaderboard?board=xp|weekly: the top players and the caller's own rank. */
export const GET = apiHandler("GET /api/leaderboard", async (request: NextRequest) => {
  const { supabase } = await requireAuthenticatedUser();
  const { flags } = await new ConfigService(supabase).get();
  if (!flags.leaderboard) throw new FeatureDisabledError();
  const board = leaderboardQuerySchema.parse(request.nextUrl.searchParams.get("board") ?? undefined);
  return json(await new LeaderboardService(supabase).get(board));
});
