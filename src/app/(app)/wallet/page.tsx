import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Disclosure } from "@/components/layout/disclosure";
import { EarningsBreakdownCard } from "@/components/dashboard/earnings-breakdown";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LoadingCard, Skeleton } from "@/components/ui/skeleton";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { LedgerFilters } from "@/components/wallet/ledger-filters";
import { LedgerTable } from "@/components/wallet/ledger-table";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { formatCoins } from "@/lib/formatting/coins";
import type { EarningsBreakdown } from "@/lib/validation/redemption";
import { queryRecord, transactionQuerySchema, type TransactionQuery } from "@/lib/validation/transactions";
import { RedemptionService } from "@/services/redemption";
import { WalletService } from "@/services/wallet";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage({ searchParams }: PageProps<"/wallet">) {
  return (
    <>
      <PageHeader title="Wallet" description="Your coin balance and everything you have earned and spent." />
      <div className="flex flex-col gap-4">
        <Disclosure compact />
        <Suspense fallback={<WalletSkeleton />}>
          <WalletContent searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function WalletContent({ searchParams }: { searchParams: PageProps<"/wallet">["searchParams"] }) {
  const { supabase, user } = await getSessionOrRedirect("/wallet");
  const raw = queryRecord(await searchParams);
  const wallet = new WalletService(supabase);
  const parsed = transactionQuerySchema.safeParse(raw);

  const [balance, breakdown] = await Promise.all([wallet.getWallet(user.id), new RedemptionService(supabase).breakdown()]);
  const filters = { type: raw.type, from: raw.from, to: raw.to };

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

      <Card className="flex flex-col gap-4">
        <CardTitle>Activity</CardTitle>
        <LedgerFilters {...filters} />
        {parsed.success ? (
          <Ledger wallet={wallet} query={parsed.data} filters={filters} />
        ) : (
          <Alert tone="danger">{parsed.error.issues[0]?.message ?? "Invalid filters"}</Alert>
        )}
      </Card>
    </>
  );
}

async function Ledger({
  wallet,
  query,
  filters,
}: {
  wallet: WalletService;
  query: TransactionQuery;
  filters: Record<string, string | undefined>;
}) {
  let page;
  try {
    page = await wallet.listTransactions(query);
  } catch (error) {
    if (error instanceof ValidationError) return <Alert tone="danger">{error.message}</Alert>;
    throw error;
  }

  const base = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const nextHref = page.nextCursor ? `/wallet?${new URLSearchParams([...base, ["cursor", page.nextCursor]])}` : null;

  return (
    <>
      <LedgerTable items={page.items} />
      <nav aria-label="Activity pages" className="flex justify-between gap-3">
        {query.cursor ? (
          <Link href={`/wallet${base.size ? `?${base}` : ""}`} className={buttonClass("ghost")}>
            Back to newest
          </Link>
        ) : (
          <span />
        )}
        {nextHref ? (
          <Link href={nextHref} className={buttonClass("secondary")}>
            Older activity
          </Link>
        ) : null}
      </nav>
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
