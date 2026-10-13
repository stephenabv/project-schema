import { Lock } from "lucide-react";
import { BadgeIcon } from "@/components/progression/badge-icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatShortDate } from "@/lib/formatting/dates";
import { describeAchievementGoal } from "@/lib/formatting/progression";
import type { Achievement } from "@/types/api";

/** Badges unlock automatically on the server when their goal is reached. */
export function AchievementGrid({ achievements }: { achievements: Achievement[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {achievements.map((a) => (
        <li
          key={a.slug}
          className={`flex flex-col gap-3 rounded-[var(--radius-card)] border p-5 ${
            a.unlocked ? "border-primary/40 bg-success-surface/40" : "border-border bg-surface"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
                a.unlocked ? "bg-primary text-white" : "bg-background text-muted"
              }`}
            >
              {a.unlocked ? <BadgeIcon icon={a.icon} className="size-6" /> : <Lock aria-hidden className="size-5" />}
            </span>
            <div>
              <h2 className="text-sm font-semibold">{a.title}</h2>
              <p className="text-xs text-muted">{a.description}</p>
            </div>
          </div>
          {a.unlocked ? (
            <p className="text-xs font-medium text-success-text">
              Unlocked{a.unlockedAt ? ` ${formatShortDate(a.unlockedAt)}` : ""}
            </p>
          ) : (
            <>
              <ProgressBar value={a.progress} max={a.threshold} label={`Progress toward ${a.title}`} />
              <p className="text-xs text-muted tabular-nums">{describeAchievementGoal(a)}</p>
            </>
          )}
          <p className="text-xs text-muted tabular-nums">
            Reward: {formatCoins(a.rewardCoins)}
            {a.xpReward > 0 ? ` · ${formatCount(a.xpReward)} XP` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
