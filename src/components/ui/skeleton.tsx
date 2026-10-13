export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-border/70 motion-reduce:animate-none ${className}`} />;
}

export function LoadingCard({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={`rounded-[var(--radius-card)] border border-border bg-surface p-5 ${className}`}>
      <Skeleton className="mb-3 h-4 w-24 max-w-full" />
      <Skeleton className="h-8 w-40 max-w-full" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
