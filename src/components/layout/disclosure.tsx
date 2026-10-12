import { Info } from "lucide-react";

export const DISCLOSURE_TEXT =
  "Virtual Earn is a simulator. All balances and rewards are virtual coins (VC): they are non-redeemable, have no monetary value, and cannot be deposited, withdrawn, or exchanged for money.";

/** The product disclosure required on the landing page, registration flow and wallet. */
export function Disclosure({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="Virtual currency disclosure"
      className={`flex gap-3 rounded-xl border border-border bg-surface text-muted ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>{DISCLOSURE_TEXT}</p>
    </aside>
  );
}
