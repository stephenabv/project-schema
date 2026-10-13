import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopGrid } from "@/components/engagement/shop-grid";
import { FeatureOff } from "@/components/layout/feature-off";
import { PageHeader } from "@/components/layout/page-header";
import { ShopSwitcher } from "@/components/layout/shop-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { getAppConfig } from "@/lib/config/app-config";
import { ProfileService } from "@/services/profile";
import { ShopService } from "@/services/shop";

export const metadata: Metadata = { title: "Shop" };

export default function ShopPage() {
  return (
    <>
      <PageHeader
        title="Cosmetic shop"
        description="Spend virtual coins on looks. Items are cosmetic only: they never change rewards."
      />
      <ShopSwitcher current="/shop" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ShopContent />
      </Suspense>
    </>
  );
}

async function ShopContent() {
  const { supabase, user } = await getSessionOrRedirect("/shop");
  if (!(await getAppConfig()).flags.shop) return <FeatureOff feature="The shop" />;
  const [shop, profile] = await Promise.all([new ShopService(supabase).list(), new ProfileService(supabase).get(user.id)]);
  return <ShopGrid initialShop={shop} avatarKey={profile.avatarKey} />;
}
