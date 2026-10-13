import type { Achievement, AchievementMetric, Mission, RewardBucket } from "@/types/api";
import { formatCoins, formatCount } from "./coins";

const METRIC_UNITS: Record<AchievementMetric, (n: number) => string> = {
  total_taps: (n) => `${formatCount(n)} taps`,
  total_coins_earned: (n) => formatCoins(n),
  missions_completed: (n) => `${formatCount(n)} missions`,
  level: (n) => `level ${formatCount(n)}`,
  longest_streak: (n) => `${formatCount(n)}-day streak`,
};

/** "40 / 100 taps", "Level 3 / level 5". */
export function describeAchievementGoal(achievement: Pick<Achievement, "metric" | "progress" | "threshold">): string {
  const unit = METRIC_UNITS[achievement.metric];
  if (achievement.metric === "level") return `Level ${formatCount(achievement.progress)} of ${unit(achievement.threshold)}`;
  return `${formatCount(achievement.progress)} / ${unit(achievement.threshold)}`;
}

export function describeMissionGoal(mission: Pick<Mission, "objectiveType" | "progress" | "target">): string {
  const noun = mission.objectiveType === "taps" ? "taps" : "missions";
  return `${formatCount(mission.progress)} / ${formatCount(mission.target)} ${noun}`;
}

const FREQUENCY_LABELS: Record<Mission["frequency"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  once: "One-time",
};

export function frequencyLabel(frequency: Mission["frequency"]): string {
  return FREQUENCY_LABELS[frequency];
}

const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** Axis label for a reward history bucket (UTC). */
export function formatBucket(bucket: RewardBucket, isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (bucket === "month") return monthLabel.format(date);
  if (bucket === "week") return `Wk of ${dayLabel.format(date)}`;
  return dayLabel.format(date);
}
