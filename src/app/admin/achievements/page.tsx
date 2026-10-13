import type { Metadata } from "next";
import { Suspense } from "react";
import { AchievementForm } from "@/components/admin/achievement-form";
import { PageHeader } from "@/components/layout/page-header";
import { BadgeIcon } from "@/components/progression/badge-icon";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Badges" };

export default function AdminAchievementsPage() {
  return (
    <>
      <PageHeader
        title="Badges"
        description="Configure badge goals and rewards. Changes apply from each player's next reward; past unlocks are kept."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AchievementsContent />
      </Suspense>
    </>
  );
}

async function AchievementsContent() {
  const { supabase } = await getAdminOrNotFound("/admin/achievements");
  const achievements = await new AdminService(supabase).listAchievements();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">New badge</summary>
          <div className="mt-4">
            <AchievementForm />
          </div>
        </details>
      </Card>
      {achievements.map((a) => (
        <Card key={a.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-success-surface text-success-text">
                <BadgeIcon icon={a.icon} />
              </span>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">{a.title}</CardTitle>
                <p className="text-xs text-muted">
                  {a.metric.replaceAll("_", " ")} ≥ {formatCount(a.threshold)} · {formatCoins(a.rewardCoins)} +{" "}
                  {formatCount(a.xpReward)} XP · unlocked by {formatCount(a.unlockedCount)}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                a.isActive ? "bg-success-surface text-success-text" : "bg-background text-muted"
              }`}
            >
              {a.isActive ? "active" : "inactive"}
            </span>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-primary">Edit</summary>
            <div className="mt-4">
              <AchievementForm achievement={a} />
            </div>
          </details>
        </Card>
      ))}
    </div>
  );
}
