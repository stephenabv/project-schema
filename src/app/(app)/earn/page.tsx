import type { Metadata } from "next";
import { Suspense } from "react";
import { TapEarner } from "@/components/earning/tap-earner";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { DashboardService } from "@/services/dashboard";
import { ProgressionService } from "@/services/progression";

export const metadata: Metadata = { title: "Earn" };

export default function EarnPage() {
  return (
    <>
      <PageHeader
        title="Earn virtual coins"
        description="Tap the button. Each accepted tap is recorded by the server and added to your virtual balance."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EarnContent />
      </Suspense>
    </>
  );
}

async function EarnContent() {
  const { supabase } = await getSessionOrRedirect("/earn");
  const [summary, progression] = await Promise.all([
    new DashboardService(supabase).getSummary(),
    new ProgressionService(supabase).get(),
  ]);

  return (
    <TapEarner
      initialBalance={summary.balanceCoins}
      initialTapsToday={summary.tapsToday}
      initialXp={progression.xpTotal}
      initialLevel={progression.level}
      policy={summary.policy}
    />
  );
}
