import { formatSignedCoins } from "@/lib/formatting/coins";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { transactionTypeLabel } from "@/lib/formatting/transactions";
import type { TransactionDto } from "@/types/api";

export function LedgerTable({ items }: { items: TransactionDto[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No activity matches these filters yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="stack-table w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">Virtual coin activity, newest first</caption>
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Date
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Activity
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Reference
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Amount (virtual)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id}>
              <td data-label="Date" className="py-3 pr-4 whitespace-nowrap text-muted">{formatDateTimeUtc(item.createdAt)}</td>
              <td data-label="Activity" className="py-3 pr-4">{transactionTypeLabel(item.type)}</td>
              <td data-label="Reference" className="py-3 pr-4 font-mono text-xs text-muted" title={item.id}>
                {item.id.slice(0, 8)}
              </td>
              <td
                data-label="Amount (virtual)"
                className={`py-3 text-right font-semibold tabular-nums ${
                  item.amountCoins > 0 ? "text-success-text" : "text-danger-text"
                }`}
              >
                {formatSignedCoins(item.amountCoins)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
