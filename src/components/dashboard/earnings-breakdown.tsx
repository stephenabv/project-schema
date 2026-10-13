import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatCoins } from "@/lib/formatting/coins";
import { formatPhp } from "@/lib/formatting/money";
import type { EarningsBreakdown } from "@/lib/validation/redemption";

/**
 * Where the player's virtual coins came from (taps, robots, everything else)
 * and, when the program is open, what is reserved or awaiting payout. All
 * figures are read from the ledgers by the server.
 */
export function EarningsBreakdownCard({ breakdown }: { breakdown: EarningsBreakdown }) {
  const sources = [
    { label: "Tapping", total: breakdown.tapCoins, today: breakdown.tapCoinsToday, colour: "bg-(--chart-blue)" },
    { label: "Robots", total: breakdown.robotCoins, today: breakdown.robotCoinsToday, colour: "bg-(--chart-purple)" },
    { label: "Bonuses and other", total: breakdown.otherCoins, today: null, colour: "bg-(--chart-amber)" },
  ];
  const sum = sources.reduce((acc, s) => acc + s.total, 0);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Earnings by source</CardTitle>
        <div className="flex gap-2">
          <ButtonLink href="/generator" variant="secondary">
            My robots
          </ButtonLink>
          {breakdown.redemptionEnabled ? (
            <ButtonLink href="/exchange" variant="secondary">
              Exchange
            </ButtonLink>
          ) : null}
        </div>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-background" aria-hidden>
        {sum > 0 ? sources.map((s) => <span key={s.label} className={s.colour} style={{ width: `${(s.total / sum) * 100}%` }} />) : null}
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {sources.map((s) => (
          <div key={s.label} className="flex items-start gap-2">
            <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${s.colour}`} />
            <div>
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className="font-semibold tabular-nums">{formatCoins(s.total)}</dd>
              {s.today !== null ? <dd className="text-xs text-muted tabular-nums">{formatCoins(s.today)} today (UTC)</dd> : null}
            </div>
          </div>
        ))}
      </dl>
      {breakdown.redemptionEnabled || breakdown.reservedCoins > 0 || breakdown.paidCentavos > 0 ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
          <Item label="Reserved for conversion" value={formatCoins(breakdown.reservedCoins)} />
          <Item label="Converted, available" value={formatPhp(breakdown.approvedCentavos)} />
          <Item label="In payout requests" value={formatPhp(breakdown.pendingPayoutCentavos)} />
          <Item label="Paid out" value={formatPhp(breakdown.paidCentavos)} />
        </dl>
      ) : null}
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
