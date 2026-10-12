import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  info: "border-border bg-background text-foreground",
  success: "border-transparent bg-success-surface text-success-text",
  warning: "border-transparent bg-warning-surface text-warning-text",
  danger: "border-transparent bg-danger-surface text-danger-text",
};

export function Alert({ tone = "info", children, id }: { tone?: Tone; children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}
