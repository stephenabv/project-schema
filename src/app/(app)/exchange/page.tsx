import type { Metadata } from "next";
import { Suspense } from "react";
import { Disclosure } from "@/components/layout/disclosure";
import { PageHeader } from "@/components/layout/page-header";
import { ConversionPanel } from "@/components/redemption/conversion-panel";
import { ProgramClosed } from "@/components/redemption/program-closed";
import { RedemptionNotice } from "@/components/redemption/request-status";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { RedemptionService } from "@/services/redemption";

export const metadata: Metadata = { title: "Exchange" };

export default function ExchangePage() {
  return (
    <>
      <PageHeader title="Exchange" description="Request to convert virtual coins to Philippine pesos when the program is open." />
      <div className="flex flex-col gap-4">
        <Disclosure compact />
        <Suspense fallback={<Skeleton className="h-96" />}>
          <ExchangeContent />
        </Suspense>
      </div>
    </>
  );
}

async function ExchangeContent() {
  const { supabase } = await getSessionOrRedirect("/exchange");
  const service = new RedemptionService(supabase);
  const [overview, conversions] = await Promise.all([service.overview(), service.conversions()]);

  if (!overview.enabled || !overview.rate) {
    return (
      <>
        <ProgramClosed feature="Conversion" />
        {conversions.length > 0 ? <ConversionPanel overview={{ ...overview, rate: null }} conversions={conversions} readOnly /> : null}
      </>
    );
  }
  return (
    <>
      <RedemptionNotice />
      <ConversionPanel overview={overview} conversions={conversions} />
    </>
  );
}
