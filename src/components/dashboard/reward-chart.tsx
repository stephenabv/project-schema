"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCoins } from "@/lib/formatting/coins";
import { formatShortDay } from "@/lib/formatting/dates";
import type { RewardSeriesPoint } from "@/types/api";

/** Daily virtual rewards, aggregated from real ledger entries (UTC days). */
export function RewardChart({ series }: { series: RewardSeriesPoint[] }) {
  const total = series.reduce((sum, point) => sum + point.coins, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
        No rewards yet. Your daily virtual earnings will appear here after your first tap.
      </div>
    );
  }

  return (
    <figure className="h-56">
      <figcaption className="sr-only">
        Daily virtual rewards for the last {series.length} days, totalling {formatCoins(total)}.
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rewardFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatShortDay}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            allowDecimals={false}
            width={48}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [formatCoins(Number(value)), "Virtual rewards"]}
            labelFormatter={(label) => `${formatShortDay(String(label))} (UTC)`}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }}
          />
          <Area
            type="monotone"
            dataKey="coins"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#rewardFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}
