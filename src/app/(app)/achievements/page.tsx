import type { Metadata } from "next";
import { Suspense } from "react";
import { AchievementGrid } from "@/components/achievements/achievement-grid";
import { PageHeader } from "@/components/layout/page-header";
import { LevelCard } from "@/components/progression/level-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { ProgressionService } from "@/services/progression";

export const metadata: Metadata = { title: "Badges" };

export default function AchievementsPage() {
  return (
    <>
      <PageHeader
        title="Badges"
        description="Badges unlock automatically as you play and pay a one-time bonus in virtual coins."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AchievementsContent />
      </Suspense>
    </>
  );
}

async function AchievementsContent() {
  const { supabase } = await getSessionOrRedirect("/achievements");
  const service = new ProgressionService(supabase);
  const [progression, achievements] = await Promise.all([service.get(), service.listAchievements()]);

  return (
    <div className="flex flex-col gap-4">
      <LevelCard progression={progression} />
      <p className="text-sm text-muted">
        {progression.achievementsUnlocked} of {progression.achievementsTotal} badges unlocked
      </p>
      <AchievementGrid achievements={achievements} />
    </div>
  );
}
