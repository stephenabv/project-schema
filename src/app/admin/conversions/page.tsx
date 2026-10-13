import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversionReviewForm } from "@/components/admin/finance-forms";
import { Pager, RequestFilters } from "@/components/admin/request-filters";
import { PageHeader } from "@/components/layout/page-header";
import { RequestTimeline, StatusPill } from "@/components/redemption/request-status";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins } from "@/lib/formatting/coins";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { formatPhp, formatRate } from "@/lib/formatting/money";
import { CONVERSION_STATUSES, conversionQuerySchema } from "@/lib/validation/redemption";
import { queryRecord } from "@/lib/validation/transactions";
import { FINANCE_PAGE_SIZE, FinanceAdminService } from "@/services/finance-admin";

export const metadata: Metadata = { title: "Conversions" };

/** A file download from a route handler, so a plain anchor rather than client navigation. */
const EXPORT_HREF = "/api/admin/exports/conversions";
const BASE = "/admin/conversions";

export default function AdminConversionsPage({ searchParams }: PageProps<"/admin/conversions">) {
  return (
    <>
      <PageHeader
        title="Conversions"
        description="VC-to-PHP conversion requests. Rejecting returns the reserved VC; completing credits the pesos at the rate snapshotted on the request."
        action={
          <a href={EXPORT_HREF} download className={buttonClass("secondary")}>
            Export CSV
          </a>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ConversionsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ConversionsContent({ searchParams }: Pick<PageProps<"/admin/conversions">, "searchParams">) {
  const { supabase, user } = await getAdminOrNotFound(BASE);
  const query = conversionQuerySchema.parse(queryRecord(await searchParams));
  const q = query.q || undefined;
  const page = await new FinanceAdminService(supabase).listConversions({ status: query.status, q, page: query.page });

  return (
    <div className="flex flex-col gap-4">
      <RequestFilters basePath={BASE} statuses={CONVERSION_STATUSES} status={query.status} q={q} />
      {page.items.length === 0 ? (
        <Card className="text-center text-sm text-muted">No conversion requests match these filters.</Card>
      ) : (
        page.items.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">{c.reference}</p>
                <p className="text-xs text-muted">
                  {c.username} · {formatDateTimeUtc(c.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {formatCoins(c.coins)} → {formatPhp(c.phpCentavos)}
                </p>
                <p className="text-xs text-muted">at {formatRate(c.rateCoins, c.rateCentavos)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusPill status={c.status} />
              {c.reviewedBy ? <span>Reviewed by {c.reviewedBy}</span> : null}
              {c.rejectionReason ? <span className="text-danger-text">Reason: {c.rejectionReason}</span> : null}
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-primary">History and actions</summary>
              <div className="mt-3 flex flex-col gap-4">
                <RequestTimeline events={c.events} />
                {c.userId === user.id ? (
                  <p className="text-xs text-muted">You cannot review your own request.</p>
                ) : (
                  <ConversionReviewForm key={`${c.id}-${c.status}`} id={c.id} status={c.status} />
                )}
              </div>
            </details>
          </Card>
        ))
      )}
      <Pager basePath={BASE} page={query.page} pageSize={FINANCE_PAGE_SIZE} total={page.total} params={{ status: query.status, q }} />
    </div>
  );
}
