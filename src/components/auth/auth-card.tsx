import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children}
      {footer ? <div className="text-center text-sm text-muted">{footer}</div> : null}
    </Card>
  );
}
