import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PayoutReviewForm } from "@/components/admin/finance-forms";
import { PageHeader } from "@/components/layout/page-header";
import { RequestTimeline, StatusPill } from "@/components/redemption/request-status";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { NotFoundError } from "@/lib/errors";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { formatPhp } from "@/lib/formatting/money";
import { requestIdSchema } from "@/lib/validation/redemption";
import { FinanceAdminService } from "@/services/finance-admin";

export const metadata: Metadata = { title: "Payout review" };

export default function AdminPayoutPage({ params }: PageProps<"/admin/payouts/[id]">) {
  return (
    <>
      <PageHeader
        title="Payout review"
        description="Opening this page records in the audit log that you viewed the account details."
        action={
          <ButtonLink href="/admin/payouts" variant="secondary">
            Back to payouts
          </ButtonLink>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <PayoutContent params={params} />
      </Suspense>
    </>
  );
}

async function PayoutContent({ params }: Pick<PageProps<"/admin/payouts/[id]">, "params">) {
  const parsedId = requestIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const { supabase, user } = await getAdminOrNotFound(`/admin/payouts/${parsedId.data}`);

  let payout;
  try {
    payout = await new FinanceAdminService(supabase).getPayout(parsedId.data);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const rows: [string, string][] = [
    ["Player", payout.username],
    ["Amount", formatPhp(payout.amountCentavos)],
    ["Method", payout.methodName],
    ["Requested", formatDateTimeUtc(payout.createdAt)],
    ["Payment reference", payout.paymentReference ?? "—"],
    ["Paid at", payout.paidAt ? formatDateTimeUtc(payout.paidAt) : "—"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-lg font-semibold">{payout.reference}</p>
          <StatusPill status={payout.status} />
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {payout.rejectionReason ? <p className="text-sm text-danger-text">Reason: {payout.rejectionReason}</p> : null}
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle>Account details</CardTitle>
        {payout.account ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Account holder</dt>
              <dd className="font-medium">{payout.account.accountName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Account number</dt>
              <dd className="font-mono font-medium">{payout.account.accountNumber}</dd>
            </div>
          </dl>
        ) : (
          <Alert tone="danger">
            The account details could not be decrypted with this deployment&apos;s key. Do not send a payment; reject or fail the
            request and ask the player to submit a new one.
          </Alert>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Actions</CardTitle>
        {payout.userId === user.id ? (
          <p className="text-sm text-muted">You cannot review your own payout request.</p>
        ) : (
          <PayoutReviewForm key={`${payout.id}-${payout.status}`} id={payout.id} status={payout.status} />
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>History</CardTitle>
        <RequestTimeline events={payout.events} />
      </Card>
    </div>
  );
}
