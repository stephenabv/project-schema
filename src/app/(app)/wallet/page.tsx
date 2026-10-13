import type { Metadata } from "next";
import { Suspense } from "react";
import { EarningsBreakdownCard } from "@/components/dashboard/earnings-breakdown";
import { Disclosure } from "@/components/layout/disclosure";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingCard, Skeleton } from "@/components/ui/skeleton";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { formatCoins } from "@/lib/formatting/coins";
import type { EarningsBreakdown } from "@/lib/validation/redemption";
import { RedemptionService } from "@/services/redemption";
import { WalletService } from "@/services/wallet";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return (
    <>
      <PageHeader title="Wallet" description="Your coin balance and where your earnings come from." />
      <div className="flex flex-col gap-4">
        <Disclosure compact />
        <Suspense fallback={<WalletSkeleton />}>
          <WalletContent />
        </Suspense>
      </div>
    </>
  );
}

async function WalletContent() {
  const { supabase, user } = await getSessionOrRedirect("/wallet");
  const [balance, breakdown] = await Promise.all([
    new WalletService(supabase).getWallet(user.id),
    new RedemptionService(supabase).breakdown(),
  ]);

  return (
    <>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{balance.label}</CardTitle>
          <VirtualBadge />
        </div>
        <p className="text-4xl font-bold tabular-nums">{formatCoins(balance.balanceCoins)}</p>
        {breakdown.reservedCoins > 0 ? (
          <p className="text-xs text-muted">{formatCoins(breakdown.reservedCoins)} set aside for your pending exchange requests.</p>
        ) : null}
        {showRedemptionLinks(breakdown) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <ButtonLink href="/exchange" variant="secondary">
              Exchange
            </ButtonLink>
            <ButtonLink href="/payouts" variant="secondary">
              Payouts
            </ButtonLink>
          </div>
        ) : null}
      </Card>

      <EarningsBreakdownCard breakdown={breakdown} />
    </>
  );
}

/** Exchange links appear only while cash-out is open or the player still has requests in it. */
function showRedemptionLinks(b: EarningsBreakdown): boolean {
  return b.redemptionEnabled || b.reservedCoins > 0 || b.approvedCentavos > 0 || b.pendingPayoutCentavos > 0 || b.paidCentavos > 0;
}

function WalletSkeleton() {
  return (
    <>
      <LoadingCard label="Loading wallet" />
      <Skeleton className="h-80" />
    </>
  );
}
