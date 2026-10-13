"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount } from "@/lib/formatting/coins";
import { formatShortDay } from "@/lib/formatting/dates";
import type { ActivityPoint } from "@/lib/validation/admin";

type Metric = Exclude<keyof ActivityPoint, "day">;

const SERIES: Record<Metric, { label: string; color: string }> = {
  taps: { label: "Taps", color: "var(--primary)" },
  activePlayers: { label: "Active players", color: "var(--chart-blue)" },
  newPlayers: { label: "New players", color: "var(--chart-purple)" },
  coinsIssued: { label: "Virtual coins issued", color: "var(--primary)" },
  missionsClaimed: { label: "Missions claimed", color: "var(--chart-amber)" },
  duplicateRequests: { label: "Duplicate requests", color: "var(--chart-red)" },
};

/** Daily platform activity (UTC days) for the admin console. */
export function ActivityChart({ series, metrics, label }: { series: ActivityPoint[]; metrics: Metric[]; label: string }) {
  return (
    <figure className="h-64">
      <figcaption className="sr-only">
        {label} for the last {series.length} days.
      </figcaption>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatShortDay}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis allowDecimals={false} width={48} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value, name) => [formatCount(Number(value)), String(name)]}
            labelFormatter={(day) => `${formatShortDay(String(day))} (UTC)`}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              name={SERIES[metric].label}
              stroke={SERIES[metric].color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
