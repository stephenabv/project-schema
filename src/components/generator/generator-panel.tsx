"use client";

import { ArrowUpCircle, Factory } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { estimatePending, GeneratorClient } from "@/lib/api/generator-client";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import type { GeneratorStatus } from "@/lib/validation/operations";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };
type Action = "collect" | "upgrade";

const TICK_MS = 1000;

/**
 * The idle generator. The coin counter ticks locally for feedback only; the
 * server computes what is actually paid from its own clock.
 */
export function GeneratorPanel({ initialStatus }: { initialStatus: GeneratorStatus }) {
  const client = useMemo(() => new GeneratorClient(), []);
  const [status, setStatus] = useState(initialStatus);
  const [renderedAt, setRenderedAt] = useState(() => Date.now());
  const [now, setNow] = useState(renderedAt);
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // One key per attempted action; cleared after a definitive answer.
  const keys = useRef<Record<Action, string | null>>({ collect: null, upgrade: null });

  useEffect(() => {
    if (status.level === 0) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [status.level]);

  const estimate = estimatePending(status, renderedAt, now);
  const capCoins = status.coinsPerHour * status.capHours;

  async function reload() {
    const next = await client.status();
    if (next) {
      setStatus(next);
      const t = Date.now();
      setRenderedAt(t);
      setNow(t);
    }
  }

  async function run(action: Action) {
    if (pending) return;
    const key = (keys.current[action] ??= crypto.randomUUID());
    setPending(action);
    setNotice(null);
    try {
      const outcome = action === "collect" ? await client.collect(key) : await client.upgrade(key);
      if (outcome.kind !== "error") keys.current[action] = null;
      switch (outcome.kind) {
        case "success":
          if ("collectedCoins" in outcome.data) {
            setNotice({ tone: "success", text: `Collected +${formatCoins(outcome.data.collectedCoins)}.` });
          } else {
            setNotice({
              tone: "success",
              text: `Generator is now level ${outcome.data.generatorLevel} (spent ${formatCoins(outcome.data.costCoins)}).`,
            });
          }
          await reload();
          break;
        case "nothing_to_collect":
          setNotice({ tone: "warning", text: "Nothing to collect yet. Give it a few minutes." });
          break;
        case "insufficient_balance":
          setNotice({ tone: "warning", text: "Not enough virtual coins for that upgrade yet." });
          break;
        case "max_level":
          setNotice({ tone: "warning", text: "Your generator is already at the maximum level." });
          await reload();
          break;
        case "unauthenticated":
          setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
          break;
        case "error":
          keys.current[action] = null;
          setNotice({ tone: "danger", text: outcome.message });
          break;
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex flex-col items-center gap-5 py-8 text-center">
        <span className="flex size-20 items-center justify-center rounded-2xl bg-success-surface text-success-text">
          <Factory aria-hidden className="size-10" />
        </span>
        {status.level === 0 ? (
          <>
            <p className="max-w-sm text-sm text-muted">
              Build a generator to earn virtual coins while you are away. It fills up for {status.capHours} hours, then
              waits for you to collect.
            </p>
            {status.nextUpgradeCost ? (
              <Button onClick={() => run("upgrade")} disabled={pending !== null || status.balanceCoins < status.nextUpgradeCost}>
                {pending === "upgrade" ? "Building…" : `Build for ${formatCoins(status.nextUpgradeCost)}`}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <div>
              <p className="text-sm text-muted">Ready to collect</p>
              <p className="text-4xl font-bold tabular-nums" aria-live="off">
                {formatCoins(estimate)}
              </p>
              <VirtualBadge className="mt-1" />
            </div>
            <div className="w-full max-w-sm">
              <ProgressBar value={estimate} max={Math.max(1, capCoins)} label="Generator storage" />
              <p className="mt-1 text-xs text-muted tabular-nums">
                {formatCount(estimate)} / {formatCount(capCoins)} VC storage · {formatCount(status.coinsPerHour)} VC per hour
              </p>
            </div>
            <Button onClick={() => run("collect")} disabled={pending !== null || estimate < 1}>
              {pending === "collect" ? "Collecting…" : "Collect"}
            </Button>
          </>
        )}
        <div aria-live="polite" className="w-full">
          {notice ? (
            <Alert tone={notice.tone}>
              {notice.text}{" "}
              {notice.signedOut ? (
                <Link href="/login?next=/generator" className="font-semibold underline">
                  Sign in again
                </Link>
              ) : null}
            </Alert>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <CardTitle>Level</CardTitle>
          <p className="text-2xl font-bold tabular-nums">
            {status.level} <span className="text-sm font-normal text-muted">/ {status.maxLevel}</span>
          </p>
          {status.level > 0 && status.nextUpgradeCost && status.nextCoinsPerHour ? (
            <>
              <p className="text-xs text-muted">
                Next level: {formatCount(status.nextCoinsPerHour)} VC per hour for {formatCoins(status.nextUpgradeCost)}.
              </p>
              <Button
                variant="secondary"
                onClick={() => run("upgrade")}
                disabled={pending !== null || status.balanceCoins < status.nextUpgradeCost}
                aria-label={`Upgrade generator for ${formatCoins(status.nextUpgradeCost)}`}
              >
                <ArrowUpCircle aria-hidden className="size-4" />
                {pending === "upgrade" ? "Upgrading…" : "Upgrade"}
              </Button>
            </>
          ) : status.level > 0 ? (
            <p className="text-xs text-muted">Maximum level reached.</p>
          ) : null}
        </Card>
        <Card>
          <CardTitle>Virtual balance</CardTitle>
          <p className="text-2xl font-bold tabular-nums">{formatCoins(status.balanceCoins)}</p>
        </Card>
      </div>
    </div>
  );
}
