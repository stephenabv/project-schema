/** Shown next to coin balances and rewards so virtual coins are never mistaken for pesos. */
export function VirtualBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-success-surface px-2.5 py-0.5 text-xs font-medium text-success-text ${className}`}
    >
      Virtual coins (VC)
    </span>
  );
}
