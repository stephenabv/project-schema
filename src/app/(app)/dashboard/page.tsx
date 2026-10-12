import { CalendarCheck, Coins, Hand, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RewardChart } from "@/components/dashboard/reward-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingCard, Skeleton } from "@/components/ui/skeleton";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { DashboardService } from "@/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your simulated earnings at a glance. Every figure comes from recorded activity."
        action={<ButtonLink href="/earn">Start tapping</ButtonLink>}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const { supabase } = await getSessionOrRedirect("/dashboard");
  const dashboard = new DashboardService(supabase);
  const [summary, series] = await Promise.all([dashboard.getSummary(), dashboard.getRewardSeries()]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 bg-gradient-to-br from-surface to-success-surface/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Virtual balance</CardTitle>
          <VirtualBadge />
        </div>
        <p className="text-4xl font-bold tabular-nums">{formatCoins(summary.balanceCoins)}</p>
        <p className="text-xs text-muted">Simulated coins. No monetary value, cannot be withdrawn or exchanged.</p>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total earned" value={formatCoins(summary.totalEarnedCoins)} icon={TrendingUp} />
        <StatCard label="Today (UTC)" value={formatCoins(summary.todayEarnedCoins)} icon={CalendarCheck} />
        <StatCard label="Taps completed" value={formatCount(summary.actionsCompleted)} icon={Hand} />
        <StatCard
          label="Taps left today"
          value={formatCount(Math.max(0, summary.policy.dailyLimit - summary.tapsToday))}
          icon={Coins}
          note={`of ${formatCount(summary.policy.dailyLimit)} daily`}
        />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Daily virtual rewards · last {series.length} days</CardTitle>
        </div>
        <RewardChart series={series} />
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingCard label="Loading balance" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <LoadingCard key={i} label="Loading statistic" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
