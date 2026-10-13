import { Info } from "lucide-react";

export const DISCLOSURE_TEXT =
  "You earn virtual coins (VC). Exchange them for Philippine pesos at the current rate, then request a payout. Our team checks every payout before sending it. Minimum amounts apply, and how much you earn depends on how much you play.";

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
