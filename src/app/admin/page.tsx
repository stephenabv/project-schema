import { Activity, AlertTriangle, CalendarCheck, Coins, Hand, ShieldCheck, Target, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActivityChart } from "@/components/admin/activity-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingCard, Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatShortDay } from "@/lib/formatting/dates";
import { AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Today's platform activity (UTC). All amounts are virtual coins." />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </>
  );
}

async function OverviewContent() {
  const { supabase } = await getAdminOrNotFound("/admin");
  const admin = new AdminService(supabase);
  const [overview, series, suspicious] = await Promise.all([
    admin.overview(),
    admin.activitySeries(14),
    admin.suspiciousActivity(7),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Players" value={formatCount(overview.totalPlayers)} icon={Users} note={`${overview.newPlayersToday} new today`} />
        <StatCard label="Active today" value={formatCount(overview.activeToday)} icon={Activity} />
        <StatCard label="Taps today" value={formatCount(overview.tapsToday)} icon={Hand} />
        <StatCard label="VC issued today" value={formatCoins(overview.coinsIssuedToday)} icon={Coins} />
        <StatCard label="Missions claimed today" value={formatCount(overview.missionsClaimedToday)} icon={Target} />
        <StatCard
          label="Duplicate requests today"
          value={formatCount(overview.duplicateRequestsToday)}
          icon={AlertTriangle}
          note="Replayed idempotency keys"
        />
        <StatCard label="VC in circulation" value={formatCoins(overview.coinsInCirculation)} icon={CalendarCheck} note="Virtual, non-redeemable" />
        <StatCard
          label="Suspended / admins"
          value={`${formatCount(overview.suspendedPlayers)} / ${formatCount(overview.admins)}`}
          icon={ShieldCheck}
          note={`${overview.publishedMissions} missions live`}
        />
      </div>

      <Card>
        <CardTitle className="mb-4">Last 14 days</CardTitle>
        <ActivityChart series={series} metrics={["taps", "activePlayers", "newPlayers"]} label="Taps, active and new players" />
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Flagged activity · last 7 days</CardTitle>
          <UserPlus aria-hidden className="size-4 text-muted" />
        </div>
        {suspicious.length === 0 ? (
          <p className="text-sm text-muted">No replayed requests or players at the daily cap.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Players with replayed requests or days at the daily tap limit</caption>
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Player</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Duplicates</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Days at cap</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Taps</th>
                  <th scope="col" className="py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {suspicious.map((row) => (
                  <tr key={row.userId}>
                    <td className="py-2 pr-4">
                      <Link href={`/admin/users?q=${row.userId}`} className="font-medium text-primary hover:underline">
                        {row.username}
                      </Link>
                      {row.suspended ? <span className="ml-2 text-xs text-danger-text">suspended</span> : null}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCount(row.duplicateRequests)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCount(row.daysAtLimit)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCount(row.taps)}</td>
                    <td className="py-2 text-muted">{formatShortDay(row.lastActiveOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <LoadingCard key={i} label="Loading metric" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
