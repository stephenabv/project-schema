import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCount } from "@/lib/formatting/coins";
import { describeAchievementGoal } from "@/lib/formatting/progression";
import type { Progression } from "@/types/api";
import { BadgeIcon } from "./badge-icon";

/** Level, XP toward the next level and the closest locked badge. */
export function LevelCard({ progression }: { progression: Progression }) {
  const { level, xpTotal, levelStartXp, nextLevelXp, nextAchievement } = progression;
  const intoLevel = xpTotal - levelStartXp;
  const levelSpan = nextLevelXp - levelStartXp;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Level and XP</CardTitle>
        <span className="text-xs text-muted tabular-nums">{formatCount(xpTotal)} XP total</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-white tabular-nums">
          {level}
        </span>
        <div className="flex flex-1 flex-col gap-1.5">
          <p className="text-sm font-semibold">Level {level}</p>
          <ProgressBar value={intoLevel} max={levelSpan} label={`XP toward level ${level + 1}`} />
          <p className="text-xs text-muted tabular-nums">
            {formatCount(intoLevel)} / {formatCount(levelSpan)} XP to level {level + 1}
          </p>
        </div>
      </div>
      {nextAchievement ? (
        <Link
          href="/achievements"
          className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 hover:border-primary"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-surface text-success-text">
            <BadgeIcon icon={nextAchievement.icon} />
          </span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Next badge</span>
            <span className="text-sm font-semibold">{nextAchievement.title}</span>
            <ProgressBar
              value={nextAchievement.progress}
              max={nextAchievement.threshold}
              label={`Progress toward ${nextAchievement.title}`}
            />
            <span className="text-xs text-muted tabular-nums">{describeAchievementGoal(nextAchievement)}</span>
          </span>
        </Link>
      ) : (
        <p className="text-sm text-muted">Every badge unlocked. Nicely done.</p>
      )}
    </Card>
  );
}
