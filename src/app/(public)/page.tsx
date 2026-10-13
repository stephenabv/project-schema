import { ChartLine, Hand, ShieldCheck } from "lucide-react";
import { Disclosure } from "@/components/layout/disclosure";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Hand,
    title: "Tap to earn",
    body: "Each accepted tap adds 10 virtual coins. The server decides every reward, so the numbers are consistent.",
  },
  {
    icon: ChartLine,
    title: "Watch it grow",
    body: "Your running balance, today's rewards and a daily chart update from recorded activity.",
  },
  {
    icon: ShieldCheck,
    title: "Simulated, by design",
    body: "No deposits, no withdrawals, no real money. It is a game about the feeling of progress.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-5">
        <span className="rounded-full bg-success-surface px-3 py-1 text-xs font-medium text-success-text">
          Earning simulator · virtual coins only
        </span>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Tap a few times. Watch your virtual earnings run.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Virtual Earn is a gamified simulator. Complete simple actions, collect virtual coins, and track your
          progress on a clean dashboard.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/register">Start simulating</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            I have an account
          </ButtonLink>
        </div>
      </section>

      <Disclosure />

      <section aria-label="Features" className="grid gap-4 sm:grid-cols-3">
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
