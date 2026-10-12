/** Shown next to every balance and reward: coins are virtual and non-redeemable. */
export function VirtualBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-success-surface px-2.5 py-0.5 text-xs font-medium text-success-text ${className}`}
    >
      Virtual · non-redeemable
    </span>
  );
}
