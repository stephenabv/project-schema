import type { Metadata } from "next";
import { Disclosure } from "@/components/layout/disclosure";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">About the simulator</h1>
      <Disclosure />
      <Card className="flex flex-col gap-3 text-sm leading-relaxed text-muted">
        <h2 className="text-base font-semibold text-foreground">How rewards work</h2>
        <p>
          Every accepted tap earns 10 virtual coins (VC). Taps have a one-second cooldown and a limit of 1,000
          accepted taps per UTC day. These rules are enforced on the server, and each reward is written to an
          append-only ledger so your balance always matches your history.
        </p>
        <h2 className="text-base font-semibold text-foreground">What virtual coins are not</h2>
        <p>
          Virtual coins are not money, credit, or an investment. There are no deposits, withdrawals, cash-outs, or
          returns of any kind, and coins cannot be transferred, sold, or exchanged.
        </p>
        <h2 className="text-base font-semibold text-foreground">Your data</h2>
        <p>
          We store your email address (for sign-in), a username, and your simulator activity. When an account is
          deleted, its profile, wallet and activity history are deleted with it.
        </p>
      </Card>
    </div>
  );
}
