import { Card, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/formatting/coins";
import { formatShortDay } from "@/lib/formatting/dates";
import { EXPORT_DATASETS, type EconomyPoint, type EngagementSummary, type RetentionCohort } from "@/lib/validation/operations";

const EXPORT_LABELS: Record<(typeof EXPORT_DATASETS)[number], string> = {
  users: "Players",
  "audit-logs": "Audit log",
  economy: "Economy (90 days)",
  conversions: "Conversion requests",
  payouts: "Payout requests",
};

const ECONOMY_COLUMNS = [
  ["Day", null],
  ["Taps", "tapCoins"],
  ["Missions", "missionCoins"],
  ["Badges", "badgeCoins"],
  ["Bonus", "bonusCoins"],
  ["Generator", "idleCoins"],
  ["Spent", "spentCoins"],
  ["Adjustments", "adjustmentCoins"],
] as const satisfies ReadonlyArray<readonly [string, keyof EconomyPoint | null]>;

function percent(part: number, whole: number): string {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

export function ExportLinks() {
  return (
    <Card>
      <CardTitle className="mb-2">CSV exports</CardTitle>
      <p className="mb-3 text-sm text-muted">Downloads are logged in the audit log and capped at 5,000 rows.</p>
      <ul className="flex flex-wrap gap-2">
        {EXPORT_DATASETS.map((dataset) => (
          <li key={dataset}>
            <a
              href={`/api/admin/exports/${dataset}`}
              download
              className="inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
            >
              {EXPORT_LABELS[dataset]}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function EngagementSummaryCard({ summary }: { summary: EngagementSummary }) {
  const stats = [
    ["Bonus claims today", formatCount(summary.bonusClaimsToday)],
    ["Active streaks", formatCount(summary.activeStreaks)],
    ["Longest streak", `${formatCount(summary.longestStreak)} days`],
    ["Items owned", formatCount(summary.itemsOwned)],
    ["Generators", formatCount(summary.generators)],
    ["Average generator level", summary.averageGeneratorLevel.toFixed(1)],
    ["Leaderboard opt-outs", formatCount(summary.leaderboardOptOuts)],
  ] as const;
  return (
    <Card>
      <CardTitle className="mb-3">Engagement features</CardTitle>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.topItems.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Most owned: {summary.topItems.map((item) => `${item.name} (${formatCount(item.owners)})`).join(", ")}
        </p>
      )}
    </Card>
  );
}

export function RetentionTable({ cohorts }: { cohorts: RetentionCohort[] }) {
  return (
    <Card>
      <CardTitle className="mb-3">Weekly retention</CardTitle>
      <div className="overflow-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <caption className="sr-only">Players by signup week and how many came back</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Signup week", "Players", "Day 1", "Week 2"].map((h) => (
                <th key={h} scope="col" className="py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {[...cohorts].reverse().map((c) => (
              <tr key={c.weekStart}>
                <td className="py-2 pr-4">{formatShortDay(c.weekStart)}</td>
                <td className="py-2 pr-4">{formatCount(c.players)}</td>
                <td className="py-2 pr-4">{percent(c.day1Active, c.players)}</td>
                <td className="py-2 pr-4">{percent(c.week2Active, c.players)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EconomyTable({ series }: { series: EconomyPoint[] }) {
  return (
    <Card>
      <CardTitle className="mb-3">Virtual economy by source</CardTitle>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Virtual coins earned by source and spent per UTC day, newest first</caption>
          <thead className="sticky top-0 border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              {ECONOMY_COLUMNS.map(([h]) => (
                <th key={h} scope="col" className="py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {[...series].reverse().map((p) => (
              <tr key={p.day}>
                {ECONOMY_COLUMNS.map(([h, key]) => (
                  <td key={h} className="py-2 pr-4">
                    {key === null ? formatShortDay(p.day) : formatCount(p[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
