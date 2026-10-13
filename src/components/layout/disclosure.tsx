import { Info } from "lucide-react";

export const DISCLOSURE_TEXT =
  "Rewards are paid in virtual coins (VC). While cash-out is open, you can convert VC to Philippine pesos at the posted exchange rate and request a payout. Every payout is reviewed and sent by hand, minimums, limits and processing times apply, and earnings depend on your activity and are not guaranteed.";

/** How virtual coins and cash-out work: shown on the landing page, registration flow, wallet and cash-out pages. */
export function Disclosure({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="How virtual coins work"
      className={`flex gap-3 rounded-xl border border-border bg-surface text-muted ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>{DISCLOSURE_TEXT}</p>
    </aside>
  );
}
