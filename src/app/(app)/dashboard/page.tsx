import { Award, CalendarCheck, Coins, Hand, Target, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { RewardChart } from "@/components/dashboard/reward-chart";
import { EarningsBreakdownCard } from "@/components/dashboard/earnings-breakdown";
import { DailyBonusCard } from "@/components/engagement/daily-bonus-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { LevelCard } from "@/components/progression/level-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingCard, Skeleton } from "@/components/ui/skeleton";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { getAppConfig } from "@/lib/config/app-config";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { REWARD_RANGES, rewardRangeSchema } from "@/lib/validation/progression";
import { BonusService } from "@/services/bonus";
import { DashboardService } from "@/services/dashboard";
import { ProgressionService } from "@/services/progression";
import { RedemptionService } from "@/services/redemption";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your simulated earnings at a glance. Every figure comes from recorded activity."
        action={<ButtonLink href="/earn">Start tapping</ButtonLink>}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function DashboardContent({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const { supabase } = await getSessionOrRedirect("/dashboard");
  const range = rewardRangeSchema.parse((await searchParams).range);
  const progressionService = new ProgressionService(supabase);
  const [summary, progression, series, bonus, config, breakdown] = await Promise.all([
    new DashboardService(supabase).getSummary(),
    progressionService.get(),
    progressionService.getRewardHistory(range),
    new BonusService(supabase).status(),
    getAppConfig(),
    new RedemptionService(supabase).breakdown(),
  ]);
  const { bucket, label } = REWARD_RANGES[range];

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

      {config.flags.dailyBonus ? <DailyBonusCard initialStatus={bonus} /> : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total earned" value={formatCoins(summary.totalEarnedCoins)} icon={TrendingUp} />
        <StatCard label="Today (UTC)" value={formatCoins(summary.todayEarnedCoins)} icon={CalendarCheck} />
        <StatCard label="Taps completed" value={formatCount(summary.actionsCompleted)} icon={Hand} />
        <StatCard
          label="Taps left today"
          value={formatCount(Math.max(0, summary.policy.dailyLimit - summary.tapsToday))}
          icon={Coins}
          note={`of ${formatCount(summary.policy.dailyLimit)} daily`}
        />
        <StatCard label="Missions completed" value={formatCount(progression.missionsCompleted)} icon={Target} />
        <StatCard
          label="Badges"
          value={`${progression.achievementsUnlocked} / ${progression.achievementsTotal}`}
          icon={Award}
        />
      </div>

      <EarningsBreakdownCard breakdown={breakdown} />

      <LevelCard progression={progression} />

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Virtual rewards · last {label}</CardTitle>
          <RangeTabs active={range} />
        </div>
        <RewardChart series={series} bucket={bucket} />
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <LoadingCard label="Loading balance" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <LoadingCard key={i} label="Loading statistic" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
