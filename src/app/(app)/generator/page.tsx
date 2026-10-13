import type { Metadata } from "next";
import { Suspense } from "react";
import { GeneratorPanel } from "@/components/generator/generator-panel";
import { FeatureOff } from "@/components/layout/feature-off";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { getAppConfig } from "@/lib/config/app-config";
import { GeneratorService } from "@/services/generator";

export const metadata: Metadata = { title: "Generator" };

export default function GeneratorPage() {
  return (
    <>
      <PageHeader
        title="Idle generator"
        description="Earns virtual coins over time, even while you are away. Collect them before storage fills up."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <GeneratorContent />
      </Suspense>
    </>
  );
}

async function GeneratorContent() {
  const { supabase } = await getSessionOrRedirect("/generator");
  if (!(await getAppConfig()).flags.idleGenerator) return <FeatureOff feature="The generator" />;
  const status = await new GeneratorService(supabase).status();
  return <GeneratorPanel initialStatus={status} />;
}
