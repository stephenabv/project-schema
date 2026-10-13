"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { estimateRobotPending, RobotClient } from "@/lib/api/robot-client";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatDateTimeUtc, formatShortDate } from "@/lib/formatting/dates";
import { coinsPerMinute, type OwnedRobot, type RobotGenerator as RobotGeneratorData } from "@/lib/validation/robots";
import { RobotArt, TierBadge } from "./robot-art";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

const TICK_MS = 1000;
/** Re-reads the server's figures so other tabs and devices stay in step. */
const REFRESH_MS = 60_000;

const ERROR_TEXT: Record<string, string> = {
  NOTHING_TO_COLLECT: "Nothing to collect yet. Give your robots a few minutes.",
  LIMIT_REACHED: "All work slots are in use. Pause another robot first.",
  FEATURE_DISABLED: "Robots are turned off right now.",
  MAINTENANCE_MODE: "Virtual Earn is under maintenance. Try again shortly.",
};

/**
 * My Robots. The counters tick locally for feedback only; every payout is
 * computed by the server from its own timestamps, so refreshing, using two
 * tabs or replaying a request never pays twice.
 */
export function RobotGenerator({ initial }: { initial: RobotGeneratorData }) {
  const client = useMemo(() => new RobotClient(), []);
  const [data, setData] = useState(initial);
  const [renderedAt, setRenderedAt] = useState(() => Date.now());
  const [now, setNow] = useState(renderedAt);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  // Keys survive retries of the same attempt and are dropped after a definitive answer.
  const keys = useRef(new Map<string, string>());

  const reload = useCallback(async () => {
    const next = await client.generator();
    if (next) {
      const t = Date.now();
      setData(next);
      setRenderedAt(t);
      setNow(t);
    }
  }, [client]);

  useEffect(() => {
    if (data.totals.activeCount === 0) return;
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, [data.totals.activeCount]);

  useEffect(() => {
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const estimates = new Map(data.robots.map((r) => [r.id, estimateRobotPending(r, data.accrualCapHours, renderedAt, now)]));
  const totalPending = [...estimates.values()].reduce((sum, v) => sum + v, 0);

  function keyFor(action: string): string {
    const existing = keys.current.get(action);
    if (existing) return existing;
    const key = crypto.randomUUID();
    keys.current.set(action, key);
    return key;
  }

  function fail(action: string, outcome: { kind: "unauthenticated" } | { kind: "error"; code?: string; message: string }) {
    if (outcome.kind === "unauthenticated") {
      setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
      return;
    }
    keys.current.delete(action);
    const known = outcome.code ? ERROR_TEXT[outcome.code] : undefined;
    setNotice({ tone: known ? "warning" : "danger", text: known ?? outcome.message });
  }

  async function collect() {
    if (pending) return;
    setPending("collect");
    setNotice(null);
    try {
      const outcome = await client.collect(keyFor("collect"));
      if (outcome.kind === "success") {
        keys.current.delete("collect");
        const { collectedCoins, robotsPaid } = outcome.data;
        setNotice({
          tone: "success",
          text: `Collected +${formatCoins(collectedCoins)} from ${formatCount(robotsPaid)} robot${robotsPaid === 1 ? "" : "s"} (virtual, non-redeemable).`,
        });
        await reload();
      } else {
        fail("collect", outcome);
      }
    } finally {
      setPending(null);
    }
  }

  async function toggle(robot: OwnedRobot) {
    if (pending) return;
    const action = `toggle:${robot.id}:${robot.isActive ? "off" : "on"}`;
    setPending(robot.id);
    setNotice(null);
    try {
      const outcome = await client.setActive(robot.id, !robot.isActive, keyFor(action));
      if (outcome.kind === "success") {
        keys.current.delete(action);
        const paid = outcome.data.paidCoins;
        setNotice({
          tone: "success",
          text: outcome.data.isActive
            ? `${robot.name} is working again.`
            : `${robot.name} is paused.${paid > 0 ? ` Its ${formatCoins(paid)} were added to your balance.` : ""}`,
        });
        await reload();
      } else {
        fail(action, outcome);
      }
    } finally {
      setPending(null);
    }
  }

  if (data.robots.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-semibold">You have no robot workers yet.</p>
        <p className="max-w-sm text-sm text-muted">Robots earn virtual coins every minute, even while you are away.</p>
        <ButtonLink href="/robots">Visit the Robot Shop</ButtonLink>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>Ready to collect from robots</CardTitle>
            <p className="text-4xl font-bold tabular-nums" aria-live="off">
              {formatCoins(totalPending)}
            </p>
            <VirtualBadge className="mt-1" />
          </div>
          <Button onClick={collect} disabled={pending !== null || totalPending < 1}>
            {pending === "collect" ? "Collecting…" : "Collect all"}
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Working" value={`${formatCount(data.totals.activeCount)} / ${formatCount(data.maxActive)}`} />
          <Stat label="Combined rate" value={`${formatCount(data.totals.coinsPerHour)} VC/h`} />
          <Stat label="Earned today" value={formatCoins(data.totals.earnedTodayCoins)} />
          <Stat label="Earned all time" value={formatCoins(data.totals.totalEarnedCoins)} />
        </dl>
        <div aria-live="polite">
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

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.robots.map((robot) => {
          const estimate = estimates.get(robot.id) ?? 0;
          const capCoins = robot.coinsPerHour * data.accrualCapHours;
          const historyOpen = openHistory === robot.id;
          return (
            <li key={robot.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-3">
                  <RobotArt imageKey={robot.imageKey} tier={robot.tier} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{robot.name}</h3>
                      <TierBadge tier={robot.tier} />
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          robot.isActive ? "bg-success-surface text-success-text" : "bg-background text-muted"
                        }`}
                      >
                        {robot.isActive ? "Working" : "Paused"}
                      </span>
                    </div>
                    <p className="text-xs text-muted tabular-nums">
                      {formatCount(robot.coinsPerHour)} VC/h · {coinsPerMinute(robot.coinsPerHour)} VC/min
                    </p>
                  </div>
                </div>

                {robot.isActive ? (
                  <div>
                    <ProgressBar value={estimate} max={Math.max(1, capCoins)} label={`${robot.name} storage`} />
                    <p className="mt-1 text-xs text-muted tabular-nums">
                      {formatCount(estimate)} / {formatCount(capCoins)} VC ready
                      {estimate >= capCoins ? " · storage full, collect to keep earning" : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Paused robots do not earn. Activate it to start earning again.</p>
                )}

                <p className="text-xs text-muted tabular-nums">
                  Earned {formatCoins(robot.totalEarnedCoins)} so far · bought {formatShortDate(robot.purchasedAt)}
                </p>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => toggle(robot)}
                    disabled={pending !== null || (!robot.isActive && data.totals.activeCount >= data.maxActive)}
                    aria-label={`${robot.isActive ? "Pause" : "Activate"} ${robot.name}`}
                  >
                    {robot.isActive ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
                    {pending === robot.id ? "Saving…" : robot.isActive ? "Pause" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setOpenHistory(historyOpen ? null : robot.id)}
                    aria-expanded={historyOpen}
                    aria-controls={`history-${robot.id}`}
                  >
                    {historyOpen ? "Hide history" : "History"}
                  </Button>
                </div>

                {historyOpen ? (
                  <div id={`history-${robot.id}`}>
                    {robot.recentEarnings.length === 0 ? (
                      <p className="text-xs text-muted">No earnings collected yet.</p>
                    ) : (
                      <ul className="divide-y divide-border text-xs">
                        {robot.recentEarnings.map((e) => (
                          <li key={`${e.periodStart}-${e.periodEnd}`} className="flex justify-between gap-2 py-1.5">
                            <span className="text-muted">
                              {formatDateTimeUtc(e.periodEnd)} · {e.reason === "collect" ? "Collected" : "Paid on pause"}
                            </span>
                            <span className="font-semibold tabular-nums">+{formatCoins(e.coins)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted">
        Each robot stores up to {formatCount(data.accrualCapHours)} hours of earnings. Up to {formatCount(data.maxActive)} robots can work
        at once. All earnings are virtual coins with no monetary value.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
