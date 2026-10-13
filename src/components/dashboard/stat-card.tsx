import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  note?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{label}</span>
        <Icon aria-hidden className="size-4 text-primary" />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </Card>
  );
}
