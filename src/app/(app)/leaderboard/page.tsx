import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, isAvatarKey } from "@/components/profile/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatShortDate } from "@/lib/formatting/dates";
import {
  LEADERBOARD_LABELS,
  LEADERBOARDS,
  leaderboardQuerySchema,
  type Leaderboard,
  type LeaderboardKind,
} from "@/lib/validation/engagement";
import { LeaderboardService } from "@/services/leaderboard";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <>
      <PageHeader
        title="Leaderboard"
        description="Friendly rankings by XP and by virtual coins earned this week. Only usernames and cosmetics are shown."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <LeaderboardContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LeaderboardContent({ searchParams }: Pick<PageProps<"/leaderboard">, "searchParams">) {
  const { supabase } = await getSessionOrRedirect("/leaderboard");
  const raw = (await searchParams).board;
  const board = leaderboardQuerySchema.parse(typeof raw === "string" ? raw : undefined);
  const leaderboard = await new LeaderboardService(supabase).get(board);
  const formatScore = board === "xp" ? (n: number) => `${formatCount(n)} XP` : formatCoins;

  return (
    <div className="flex flex-col gap-4">
      <BoardTabs active={board} />
      <YourRank leaderboard={leaderboard} formatScore={formatScore} />
      <Card className="p-0">
        {leaderboard.entries.length === 0 ? (
          <p className="p-5 text-center text-sm text-muted">No ranked players yet. Earn some XP to take the top spot.</p>
        ) : (
          <ol aria-label={LEADERBOARD_LABELS[board]} className="divide-y divide-border">
            {leaderboard.entries.map((entry) => (
              <li
                key={`${entry.rank}-${entry.username}`}
                aria-current={entry.isYou ? "true" : undefined}
                className={`flex items-center gap-3 px-5 py-3 ${entry.isYou ? "bg-success-surface/60" : ""}`}
              >
                <span className="w-8 text-right text-sm font-bold tabular-nums text-muted">#{entry.rank}</span>
                {isAvatarKey(entry.avatarKey) ? <Avatar avatarKey={entry.avatarKey} size="sm" frame={entry.frame} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {entry.username}
                    {entry.isYou ? <span className="ml-1 text-xs font-normal text-muted">(you)</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    Level {formatCount(entry.level)}
                    {entry.title ? ` · ${entry.title}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatScore(entry.score)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {board === "weekly" ? (
        <p className="text-xs text-muted">
          Week started {formatShortDate(leaderboard.weekStartsOn)} (Monday, UTC). Virtual coins have no monetary value.
        </p>
      ) : null}
    </div>
  );
}

function BoardTabs({ active }: { active: LeaderboardKind }) {
  return (
    <nav aria-label="Leaderboard" className="flex w-fit gap-1 rounded-xl bg-background p-1">
      {LEADERBOARDS.map((board) => (
        <Link
          key={board}
          href={board === "xp" ? "/leaderboard" : `/leaderboard?board=${board}`}
          scroll={false}
          aria-current={board === active ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            board === active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {LEADERBOARD_LABELS[board]}
        </Link>
      ))}
    </nav>
  );
}

function YourRank({ leaderboard, formatScore }: { leaderboard: Leaderboard; formatScore: (n: number) => string }) {
  const { you } = leaderboard;
  if (you.optedOut) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>You are hidden from leaderboards.</span>
        <ButtonLink href="/settings" variant="secondary">
          Change in settings
        </ButtonLink>
      </Card>
    );
  }
  return (
    <Card className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted">Your rank</span>
      <span className="text-lg font-bold tabular-nums">
        {you.rank ? `#${formatCount(you.rank)}` : "Unranked"} · {formatScore(you.score)}
      </span>
    </Card>
  );
}
