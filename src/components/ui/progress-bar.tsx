/** Accessible horizontal progress bar. */
export function ProgressBar({
  value,
  max,
  label,
  className = "",
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={`h-2 overflow-hidden rounded-full bg-border ${className}`}
    >
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}
