import { buttonClass } from "@/components/ui/button";
import { transactionTypeLabel } from "@/lib/formatting/transactions";
import { TRANSACTION_TYPES } from "@/lib/validation/transactions";

/** Plain GET form: filters live in the URL, so they are shareable and work without JS. */
export function LedgerFilters({ type, from, to }: { type?: string; from?: string; to?: string }) {
  const inputClass = "rounded-xl border border-border bg-surface px-3 py-2 text-sm";
  return (
    <form method="get" action="/wallet" className="flex flex-wrap items-end gap-3" aria-label="Filter activity">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Type
        <select name="type" defaultValue={type ?? ""} className={inputClass}>
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {transactionTypeLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        From (UTC)
        <input type="date" name="from" defaultValue={from} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        To (UTC)
        <input type="date" name="to" defaultValue={to} className={inputClass} />
      </label>
      <button type="submit" className={buttonClass("secondary")}>
        Apply
      </button>
      <a href="/wallet" className={buttonClass("ghost")}>
        Reset
      </a>
    </form>
  );
}
