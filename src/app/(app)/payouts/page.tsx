import type { Metadata } from "next";
import { Suspense } from "react";
import { Disclosure } from "@/components/layout/disclosure";
import { PageHeader } from "@/components/layout/page-header";
import { PayoutPanel } from "@/components/redemption/payout-panel";
import { ProgramClosed } from "@/components/redemption/program-closed";
import { RedemptionNotice } from "@/components/redemption/request-status";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { RedemptionService } from "@/services/redemption";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage() {
  return (
    <>
      <PageHeader title="Payouts" description="Request a payout of converted pesos. Every request is reviewed and paid by hand." />
      <div className="flex flex-col gap-4">
        <Disclosure compact />
        <Suspense fallback={<Skeleton className="h-96" />}>
          <PayoutsContent />
        </Suspense>
      </div>
    </>
  );
}

async function PayoutsContent() {
  const { supabase } = await getSessionOrRedirect("/payouts");
  const service = new RedemptionService(supabase);
  const [overview, payouts] = await Promise.all([service.overview(), service.payouts()]);

  if (!overview.enabled) {
    return (
      <>
        <ProgramClosed feature="Payouts" />
        {payouts.length > 0 ? <PayoutPanel overview={overview} payouts={payouts} readOnly /> : null}
      </>
    );
  }
  return (
    <>
      <RedemptionNotice />
      <PayoutPanel overview={overview} payouts={payouts} />
    </>
  );
}
