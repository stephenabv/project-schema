import type { Metadata } from "next";
import { Suspense } from "react";
import { ExchangeRateForm, PayoutMethodForm, RedemptionPolicyForm } from "@/components/admin/finance-forms";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { formatRate } from "@/lib/formatting/money";
import { FinanceAdminService } from "@/services/finance-admin";

export const metadata: Metadata = { title: "Exchange" };

export default function AdminExchangePage() {
  return (
    <>
      <PageHeader
        title="Exchange"
        description="The VC-to-PHP rate, conversion and payout limits, and payout methods. Every change is audited with your account."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ExchangeContent />
      </Suspense>
    </>
  );
}

async function ExchangeContent() {
  const { supabase } = await getAdminOrNotFound("/admin/exchange");
  const redemption = await new FinanceAdminService(supabase).redemption();
  const { policy, currentRate, rates, methods } = redemption;
  // The current rate is the latest one already in effect, so anything after it is still scheduled.
  const currentFrom = currentRate ? Date.parse(currentRate.effectiveAt) : Number.NEGATIVE_INFINITY;

  return (
    <div className="flex flex-col gap-4">
      <Alert tone={policy.enabled ? "warning" : "info"}>
        {policy.enabled
          ? "Conversion and payouts are open to players. Payouts are manual: send each one yourself and record its reference before marking it paid."
          : "Conversion and payouts are closed (the default). Players see that the program is not available, and every balance stays virtual."}
        {redemption.policyUpdatedAt
          ? ` Last changed ${formatDateTimeUtc(redemption.policyUpdatedAt)}${redemption.policyUpdatedBy ? ` by ${redemption.policyUpdatedBy}` : ""}.`
          : ""}
      </Alert>

      <Card className="flex flex-col gap-3">
        <CardTitle>Program settings</CardTitle>
        <RedemptionPolicyForm policy={policy} />
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Exchange rate</CardTitle>
        <p className="text-sm">
          {currentRate ? (
            <>
              Current: <span className="font-semibold">{formatRate(currentRate.rateCoins, currentRate.rateCentavos)}</span>
              <span className="text-muted"> since {formatDateTimeUtc(currentRate.effectiveAt)}</span>
            </>
          ) : (
            <span className="text-muted">No rate set yet. The program cannot open without one.</span>
          )}
        </p>
        <ExchangeRateForm current={currentRate} />
        {rates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Exchange rate history, newest first</caption>
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  {["Effective", "Rate", "Reason", "Set by", "Recorded"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {formatDateTimeUtc(rate.effectiveAt)}
                      {Date.parse(rate.effectiveAt) > currentFrom ? <span className="ml-1 text-xs text-warning-text">scheduled</span> : null}
                      {rate.id === currentRate?.id ? <span className="ml-1 text-xs text-success-text">current</span> : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{formatRate(rate.rateCoins, rate.rateCentavos)}</td>
                    <td className="py-2 pr-3">{rate.reason}</td>
                    <td className="py-2 pr-3">{rate.createdBy ?? "system"}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatDateTimeUtc(rate.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Payout methods</CardTitle>
        {methods.map((method) => (
          <details key={method.id} className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {method.name} <span className="font-normal text-muted">({method.code}{method.isActive ? "" : ", hidden"})</span>
            </summary>
            <div className="mt-3">
              <PayoutMethodForm method={method} />
            </div>
          </details>
        ))}
        <details className="rounded-xl border border-dashed border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary">Add a method</summary>
          <div className="mt-3">
            <PayoutMethodForm />
          </div>
        </details>
      </Card>
    </div>
  );
}
