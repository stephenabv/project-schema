import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { ActivityChart } from "@/components/admin/activity-chart";
import { EconomyTable, EngagementSummaryCard, ExportLinks, RetentionTable } from "@/components/admin/economy-sections";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatShortDay } from "@/lib/formatting/dates";
import { AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [7, 30, 90] as const;
const RETENTION_WEEKS = 8;
const rangeSchema = z.coerce.number().pipe(z.union(RANGES.map((n) => z.literal(n)))).catch(30);

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <>
      <PageHeader title="Analytics" description="Daily activity by UTC day." />
      <Suspense fallback={<Skeleton className="h-[640px]" />}>
        <AnalyticsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AnalyticsContent({ searchParams }: Pick<PageProps<"/admin/analytics">, "searchParams">) {
  const { supabase } = await getAdminOrNotFound("/admin/analytics");
  const days = rangeSchema.parse((await searchParams).days);
  const admin = new AdminService(supabase);
  const [series, economy, retention, engagement] = await Promise.all([
    admin.activitySeries(days),
    admin.economySeries(days),
    admin.retention(RETENTION_WEEKS),
    admin.engagementSummary(),
  ]);
  const totals = series.reduce(
    (sum, p) => ({
      taps: sum.taps + p.taps,
      coins: sum.coins + p.coinsIssued,
      missions: sum.missions + p.missionsClaimed,
      signups: sum.signups + p.newPlayers,
    }),
    { taps: 0, coins: 0, missions: 0, signups: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Range" className="flex gap-1 self-start rounded-xl bg-background p-1">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/admin/analytics?days=${range}`}
            aria-current={range === days ? "page" : undefined}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${
              range === days ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {range} days
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted">
        {formatCount(totals.taps)} taps · {formatCoins(totals.coins)} issued · {formatCount(totals.missions)} missions
        claimed · {formatCount(totals.signups)} new players in the last {days} days.
      </p>
      <Card>
        <CardTitle className="mb-4">Engagement</CardTitle>
        <ActivityChart series={series} metrics={["activePlayers", "newPlayers"]} label="Active and new players" />
      </Card>
      <Card>
        <CardTitle className="mb-4">Taps and missions</CardTitle>
        <ActivityChart series={series} metrics={["taps", "missionsClaimed"]} label="Taps and missions claimed" />
      </Card>
      <Card>
        <CardTitle className="mb-4">Virtual coins issued and duplicate requests</CardTitle>
        <ActivityChart series={series} metrics={["coinsIssued", "duplicateRequests"]} label="Coins issued and duplicates" />
      </Card>
      <EngagementSummaryCard summary={engagement} />
      <EconomyTable series={economy} />
      <RetentionTable cohorts={retention} />
      <ExportLinks />
      <Card>
        <CardTitle className="mb-3">Daily table</CardTitle>
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Daily platform activity, newest first</caption>
            <thead className="sticky top-0 border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Day", "Active", "New", "Taps", "VC issued", "Missions", "Duplicates"].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {[...series].reverse().map((p) => (
                <tr key={p.day}>
                  <td className="py-2 pr-4">{formatShortDay(p.day)}</td>
                  <td className="py-2 pr-4">{formatCount(p.activePlayers)}</td>
                  <td className="py-2 pr-4">{formatCount(p.newPlayers)}</td>
                  <td className="py-2 pr-4">{formatCount(p.taps)}</td>
                  <td className="py-2 pr-4">{formatCount(p.coinsIssued)}</td>
                  <td className="py-2 pr-4">{formatCount(p.missionsClaimed)}</td>
                  <td className="py-2 pr-4">{formatCount(p.duplicateRequests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
