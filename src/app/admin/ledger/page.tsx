import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatPhp, formatRate } from "@/lib/formatting/money";
import { CONVERSION_STATUSES, PAYOUT_STATUSES, STATUS_LABELS } from "@/lib/validation/redemption";
import { FinanceAdminService } from "@/services/finance-admin";

export const metadata: Metadata = { title: "Ledger check" };

export default function AdminLedgerPage() {
  return (
    <>
      <PageHeader
        title="Ledger check"
        description="Finance totals and a reconciliation of every balance against its append-only ledger and open requests."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <LedgerContent />
      </Suspense>
    </>
  );
}

async function LedgerContent() {
  const { supabase } = await getAdminOrNotFound("/admin/ledger");
  const finance = new FinanceAdminService(supabase);
  const [overview, issues] = await Promise.all([finance.overview(), finance.ledgerCheck()]);

  const totals: [string, string][] = [
    ["Program", overview.redemptionEnabled ? "Open" : "Closed"],
    ["Current rate", overview.currentRate ? formatRate(overview.currentRate.rateCoins, overview.currentRate.rateCentavos) : "Not set"],
    ["VC reserved by conversions", formatCoins(overview.reservedCoins)],
    ["PHP available to players", formatPhp(overview.availableCentavos)],
    ["PHP held in payout requests", formatPhp(overview.reservedCentavos)],
    ["PHP paid out (verified)", formatPhp(overview.paidCentavos)],
    ["Robot VC today (UTC)", formatCoins(overview.robotCoinsToday)],
    ["Tap VC today (UTC)", formatCoins(overview.tapCoinsToday)],
  ];

  return (
    <div className="flex flex-col gap-4">
      {issues.length === 0 ? (
        <Alert tone="success">Every balance matches its ledger and open requests.</Alert>
      ) : (
        <Alert tone="danger">
          {formatCount(issues.length)} account{issues.length === 1 ? "" : "s"} do not reconcile. Pause reviews for them and investigate
          before paying anything.
        </Alert>
      )}

      <Card>
        <CardTitle className="mb-3">Totals</CardTitle>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {totals.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatusTable
          title="Conversions by status"
          rows={CONVERSION_STATUSES.map((s) => {
            const t = overview.conversions[s];
            return [STATUS_LABELS[s], formatCount(t?.count ?? 0), formatCoins(t?.coins ?? 0), formatPhp(t?.phpCentavos ?? 0)];
          })}
          headers={["Status", "Requests", "VC", "PHP"]}
        />
        <StatusTable
          title="Payouts by status"
          rows={PAYOUT_STATUSES.map((s) => {
            const t = overview.payouts[s];
            return [STATUS_LABELS[s], formatCount(t?.count ?? 0), formatPhp(t?.amountCentavos ?? 0)];
          })}
          headers={["Status", "Requests", "PHP"]}
        />
      </div>

      {issues.length > 0 ? (
        <Card className="overflow-x-auto">
          <CardTitle className="mb-3">Discrepancies</CardTitle>
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="uppercase tracking-wide text-muted">
              <tr>
                {["Player", "VC balance / ledger", "VC reserved / open", "PHP available / ledger", "PHP held / ledger / open", "PHP paid / ledger"].map(
                  (h) => (
                    <th key={h} scope="col" className="py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {issues.map((i) => (
                <tr key={i.userId}>
                  <td className="py-2 pr-3 font-sans text-sm">{i.username}</td>
                  <td className="py-2 pr-3">
                    {i.balanceCoins} / {i.ledgerCoins}
                  </td>
                  <td className="py-2 pr-3">
                    {i.reservedCoins} / {i.openConversionCoins}
                  </td>
                  <td className="py-2 pr-3">
                    {i.availableCentavos} / {i.ledgerAvailableCentavos}
                  </td>
                  <td className="py-2 pr-3">
                    {i.reservedCentavos} / {i.ledgerReservedCentavos} / {i.openPayoutCentavos}
                  </td>
                  <td className="py-2 pr-3">
                    {i.paidCentavos} / {i.ledgerPaidCentavos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Peso figures are in centavos.</p>
        </Card>
      ) : null}
    </div>
  );
}

function StatusTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <Card className="overflow-x-auto">
      <CardTitle className="mb-3">{title}</CardTitle>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
