import { PowerOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Shown in place of a feature an admin has turned off. */
export function FeatureOff({ feature }: { feature: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <PowerOff aria-hidden className="size-6 text-muted" />
      <p className="text-sm font-semibold">{feature} is turned off right now.</p>
      <p className="text-sm text-muted">Check back later. Your balance and progress are safe.</p>
      <ButtonLink href="/dashboard" variant="secondary">
        Back to dashboard
      </ButtonLink>
    </Card>
  );
}
