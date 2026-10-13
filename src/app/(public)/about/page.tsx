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
          You earn virtual coins (VC) by tapping, completing missions, claiming daily bonuses and running robots. Taps
          have a short cooldown and per-minute and daily limits. These rules are enforced on the server, and each
          reward is written to an append-only ledger so your balance always matches your history.
        </p>
        <h2 className="text-base font-semibold text-foreground">Cashing out</h2>
        <p>
          While cash-out is open, you can convert VC to Philippine pesos at the exchange rate shown on the Exchange
          page. The rate is locked when you submit a request. Converted pesos can then be requested as a payout to one
          of the listed payout methods. Every conversion and payout is reviewed and sent by hand, has a reference
          number you can track, and can be rejected, in which case your coins or pesos are returned. Minimums, limits
          and processing times apply. Earnings depend on your activity and are not guaranteed, and Virtual Earn is not
          an investment.
        </p>
        <h2 className="text-base font-semibold text-foreground">Your data</h2>
        <p>
          We store your email address (for sign-in), a username, your activity, and the payout account details you
          enter, which are encrypted. When an account is deleted, its profile, wallet and activity history are deleted
          with it.
        </p>
      </Card>
    </div>
  );
}
