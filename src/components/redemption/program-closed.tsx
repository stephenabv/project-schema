import { ArrowLeftRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Conversion and payouts are off by default and only open once an admin enables them. */
export function ProgramClosed({ feature }: { feature: "Conversion" | "Payouts" }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <ArrowLeftRight aria-hidden className="size-6 text-muted" />
      <p className="text-sm font-semibold">{feature} {feature === "Payouts" ? "are" : "is"} not available.</p>
      <p className="max-w-md text-sm text-muted">
        Virtual coins cannot be converted or withdrawn right now. Your balance stays virtual and non-redeemable. If the
        program opens, it will appear here.
      </p>
      <ButtonLink href="/dashboard" variant="secondary">
        Back to dashboard
      </ButtonLink>
    </Card>
  );
}
