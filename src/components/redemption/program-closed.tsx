import { ArrowLeftRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Shown while an admin has cash-out (conversion and payouts) paused. */
export function ProgramClosed({ feature }: { feature: "Conversion" | "Payouts" }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <ArrowLeftRight aria-hidden className="size-6 text-muted" />
      <p className="text-sm font-semibold">{feature} {feature === "Payouts" ? "are" : "is"} not available.</p>
      <p className="max-w-md text-sm text-muted">
        Cash-out is paused right now. Your virtual coins stay in your balance, and you can convert them here once it
        reopens.
      </p>
      <ButtonLink href="/dashboard" variant="secondary">
        Back to dashboard
      </ButtonLink>
    </Card>
  );
}
