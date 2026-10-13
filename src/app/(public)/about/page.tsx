import type { Metadata } from "next";
import { Disclosure } from "@/components/layout/disclosure";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">About Virtual Earn</h1>
      <Disclosure />
      <Card className="flex flex-col gap-3 text-sm leading-relaxed text-muted">
        <h2 className="text-base font-semibold text-foreground">How rewards work</h2>
        <p>
          You earn virtual coins (VC) by tapping, completing missions, claiming daily bonuses and running robots.
          There is a daily tap limit, and robots keep earning for you even while you are away.
        </p>
        <h2 className="text-base font-semibold text-foreground">Cashing out</h2>
        <p>
          Exchange your VC for Philippine pesos on the Exchange page, then request a payout to one of our payout options.
          The rate you see when you submit is the rate you get. Our team reviews every request, and each one has a
          reference number so you can follow its progress. If a request is declined, your coins or pesos go back to
          your balance. Minimum amounts apply, and how much you earn depends on how much you play.
        </p>
        <h2 className="text-base font-semibold text-foreground">Your data</h2>
        <p>
          We store your email address (for sign-in), a username, your activity, and the payout details you enter,
          which we keep private. When an account is deleted, its profile, wallet and activity history are deleted
          with it.
        </p>
      </Card>
    </div>
  );
}
