import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { MissionsBoard } from "@/components/missions/missions-board";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { MissionService } from "@/services/missions";

export const metadata: Metadata = { title: "Missions" };

export default function MissionsPage() {
  return (
    <>
      <PageHeader
        title="Missions"
        description="Complete goals to claim bonus virtual coins and XP. Daily missions reset at midnight UTC, weekly ones on Monday."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <MissionsContent />
      </Suspense>
    </>
  );
}

async function MissionsContent() {
  const { supabase } = await getSessionOrRedirect("/missions");
  const missions = await new MissionService(supabase).list();
  return <MissionsBoard initialMissions={missions} />;
}
