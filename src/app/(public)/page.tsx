import { ChartLine, Hand, Wallet } from "lucide-react";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";
import { Disclosure } from "@/components/layout/disclosure";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Hand,
    title: "Tap to earn",
    body: "Every accepted tap adds virtual coins. The server decides every reward, so the numbers are consistent.",
  },
  {
    icon: ChartLine,
    title: "Watch it grow",
    body: "Your running balance, today's rewards and a daily chart update from recorded activity.",
  },
  {
    icon: Wallet,
    title: "Cash out to pesos",
    body: "Convert virtual coins to Philippine pesos at the posted rate and request a payout. Each payout is reviewed and sent by hand.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-10">
      <SignedInRedirect />
      <section className="flex flex-col items-start gap-5">
        <span className="rounded-full bg-success-surface px-3 py-1 text-xs font-medium text-success-text">
          Tap · earn · cash out
        </span>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Tap, earn virtual coins, and cash out to pesos.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Complete simple actions, run robots, and collect virtual coins. Track your progress on a clean dashboard and
          convert your coins to pesos when you are ready.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/register">Start earning</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            I have an account
          </ButtonLink>
        </div>
      </section>

      <Disclosure />

      <section aria-label="Features" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <Icon aria-hidden className="mb-3 size-5 text-primary" />
            <h2 className="mb-1 font-semibold">{title}</h2>
            <p className="text-sm text-muted">{body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
