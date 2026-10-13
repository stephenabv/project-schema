import type { Metadata } from "next";
import { Suspense } from "react";
import { GeneratorPanel } from "@/components/generator/generator-panel";
import { FeatureOff } from "@/components/layout/feature-off";
import { PageHeader } from "@/components/layout/page-header";
import { RobotGenerator } from "@/components/robots/robot-generator";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { getAppConfig } from "@/lib/config/app-config";
import { GeneratorService } from "@/services/generator";
import { RobotService } from "@/services/robots";

export const metadata: Metadata = { title: "Generator" };

export default function GeneratorPage() {
  return (
    <>
      <PageHeader
        title="Generator"
        description="Your robots and starter generator earn virtual coins over time, even while you are away. Collect them before storage fills up."
        action={
          <ButtonLink href="/robots" variant="secondary">
            Robot Shop
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-8">
        <section aria-labelledby="my-robots" className="flex flex-col gap-3">
          <h2 id="my-robots" className="text-lg font-semibold">
            My robots
          </h2>
          <Suspense fallback={<Skeleton className="h-72" />}>
            <RobotsContent />
          </Suspense>
        </section>
        <section aria-labelledby="starter-generator" className="flex flex-col gap-3">
          <h2 id="starter-generator" className="text-lg font-semibold">
            Starter generator
          </h2>
          <Suspense fallback={<Skeleton className="h-96" />}>
            <GeneratorContent />
          </Suspense>
        </section>
      </div>
    </>
  );
}

async function RobotsContent() {
  const { supabase } = await getSessionOrRedirect("/generator");
  if (!(await getAppConfig()).flags.robots) return <FeatureOff feature="Robot workers" />;
  const generator = await new RobotService(supabase).generator();
  return <RobotGenerator initial={generator} />;
}

async function GeneratorContent() {
  const { supabase } = await getSessionOrRedirect("/generator");
  if (!(await getAppConfig()).flags.idleGenerator) return <FeatureOff feature="The generator" />;
  const status = await new GeneratorService(supabase).status();
  return <GeneratorPanel initialStatus={status} />;
}
