import type { Metadata } from "next";
import { Suspense } from "react";
import { FeatureOff } from "@/components/layout/feature-off";
import { PageHeader } from "@/components/layout/page-header";
import { ShopSwitcher } from "@/components/layout/shop-switcher";
import { RobotShop } from "@/components/robots/robot-shop";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { getAppConfig } from "@/lib/config/app-config";
import { RobotService } from "@/services/robots";

export const metadata: Metadata = { title: "Robot Shop" };

export default function RobotsPage() {
  return (
    <>
      <PageHeader
        title="Robot Shop"
        description="Hire robot workers that earn virtual coins every minute. Higher tiers cost more and earn more."
      />
      <ShopSwitcher current="/robots" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <RobotShopContent />
      </Suspense>
    </>
  );
}

async function RobotShopContent() {
  const { supabase } = await getSessionOrRedirect("/robots");
  if (!(await getAppConfig()).flags.robots) return <FeatureOff feature="Robot workers" />;
  const shop = await new RobotService(supabase).shop();
  return <RobotShop initialShop={shop} />;
}
