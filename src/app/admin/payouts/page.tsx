import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pager, RequestFilters } from "@/components/admin/request-filters";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPill } from "@/components/redemption/request-status";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { formatPhp } from "@/lib/formatting/money";
import { PAYOUT_STATUSES, payoutQuerySchema } from "@/lib/validation/redemption";
import { queryRecord } from "@/lib/validation/transactions";
import { FINANCE_PAGE_SIZE, FinanceAdminService } from "@/services/finance-admin";

export const metadata: Metadata = { title: "Payouts" };

/** A file download from a route handler, so a plain anchor rather than client navigation. */
const EXPORT_HREF = "/api/admin/exports/payouts";
const BASE = "/admin/payouts";

export default function AdminPayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  return (
    <>
      <PageHeader
        title="Payouts"
        description="Manual payout queue. There is no payment provider: send each payment yourself, then record its reference to mark it paid."
        action={
          <a href={EXPORT_HREF} download className={buttonClass("secondary")}>
            Export CSV
          </a>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <PayoutsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PayoutsContent({ searchParams }: Pick<PageProps<"/admin/payouts">, "searchParams">) {
  const { supabase } = await getAdminOrNotFound(BASE);
  const query = payoutQuerySchema.parse(queryRecord(await searchParams));
  const q = query.q || undefined;
  const page = await new FinanceAdminService(supabase).listPayouts({ status: query.status, q, page: query.page });

  return (
    <div className="flex flex-col gap-4">
      <RequestFilters basePath={BASE} statuses={PAYOUT_STATUSES} status={query.status} q={q} />
      <Card className="overflow-x-auto p-0">
        <table className="stack-table w-full min-w-[760px] text-left text-sm [--stack-table-inset:1rem]">
          <caption className="sr-only">Payout requests, newest first</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Reference", "Player", "Amount", "Method", "Status", "Requested", ""].map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {page.items.map((p) => (
              <tr key={p.id}>
                <td data-label="Reference" className="px-4 py-3 font-mono text-xs">{p.reference}</td>
                <td data-label="Player" className="px-4 py-3">{p.username}</td>
                <td data-label="Amount" className="px-4 py-3 font-semibold tabular-nums">{formatPhp(p.amountCentavos)}</td>
                <td data-label="Method" className="px-4 py-3">
                  {p.methodName} <span className="text-xs text-muted">{p.accountHint}</span>
                </td>
                <td data-label="Status" className="px-4 py-3">
                  <StatusPill status={p.status} />
                </td>
                <td data-label="Requested" className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTimeUtc(p.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`${BASE}/${p.id}`} className={buttonClass("secondary")}>
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {page.items.length === 0 ? <p className="p-8 text-center text-sm text-muted">No payout requests match these filters.</p> : null}
      </Card>
      <Pager basePath={BASE} page={query.page} pageSize={FINANCE_PAGE_SIZE} total={page.total} params={{ status: query.status, q }} />
    </div>
  );
}
