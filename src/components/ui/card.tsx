import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }: ComponentProps<"h2">) {
  return <h2 className={`text-sm font-medium text-muted ${className}`} {...props} />;
}
