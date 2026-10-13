"use client";

import { Hand } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { TapClient } from "@/lib/api/tap-client";
import { tapSkinClass } from "@/lib/cosmetics/styles";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import type { TapPolicy, UnlockedAchievement } from "@/types/api";
import { AnimatedNumber } from "./animated-number";

interface TapEarnerProps {
  initialBalance: number;
  initialTapsToday: number;
  initialXp: number;
  initialLevel: number;
  policy: TapPolicy;
  /** Equipped tap skin style key from the shop, if any. */
  tapSkin?: string | null;
}

type Status =
  | { kind: "ready" }
  | { kind: "pending" }
  | { kind: "cooldown" }
  | { kind: "limit" }
  | { kind: "signed_out" }
  | { kind: "error"; message: string };

interface FloatingReward {
  id: string;
  amount: number;
}

/**
 * The core interaction: tap, wait for the server to accept, then show the
 * new server-confirmed balance. The browser never decides the amount.
 */
export function TapEarner({
  initialBalance,
  initialTapsToday,
  initialXp,
  initialLevel,
  policy,
  tapSkin = null,
}: TapEarnerProps) {
  const client = useMemo(() => new TapClient(), []);
  const [balance, setBalance] = useState(initialBalance);
  const [tapsToday, setTapsToday] = useState(initialTapsToday);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [xp, setXp] = useState({ total: initialXp, level: initialLevel });
  const [badges, setBadges] = useState<UnlockedAchievement[]>([]);
  const [status, setStatus] = useState<Status>(
    initialTapsToday >= policy.dailyLimit ? { kind: "limit" } : { kind: "ready" },
  );
  const [floats, setFloats] = useState<FloatingReward[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [pulseKey, setPulseKey] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against double-clicks that land before the next render.
  const inFlight = useRef(false);

  useEffect(() => () => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
  }, []);

  const startCooldown = useCallback((ms: number) => {
    setStatus({ kind: "cooldown" });
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setStatus({ kind: "ready" }), ms);
  }, []);

  const busy = status.kind === "pending" || status.kind === "cooldown";
  const disabled = busy || status.kind === "limit" || status.kind === "signed_out";

  const handleTap = useCallback(async () => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setStatus({ kind: "pending" });
    setPulseKey((k) => k + 1);

    let outcome;
    try {
      outcome = await client.tap(crypto.randomUUID());
    } finally {
      inFlight.current = false;
    }

    switch (outcome.kind) {
      case "success": {
        const { data } = outcome;
        setBalance(data.balanceCoins);
        setTapsToday(data.tapsToday);
        setXp({ total: data.xpTotal, level: data.level });
        if (data.unlockedAchievements.length > 0) setBadges(data.unlockedAchievements);
        if (!data.duplicate) {
          setSessionEarned((total) => total + data.rewardCoins);
          setFloats((list) => [...list.slice(-4), { id: data.transactionId, amount: data.rewardCoins }]);
          setAnnouncement(
            `Plus ${data.rewardCoins} virtual coins. Balance ${formatCoins(data.balanceCoins)}.` +
              (data.unlockedAchievements.length > 0
                ? ` New badge: ${data.unlockedAchievements.map((a) => a.title).join(", ")}.`
                : ""),
          );
        }
        if (data.tapsToday >= policy.dailyLimit) setStatus({ kind: "limit" });
        else startCooldown(policy.cooldownMs);
        break;
      }
      case "cooldown":
        startCooldown(outcome.retryAfterMs);
        break;
      case "daily_limit":
        setStatus({ kind: "limit" });
        break;
      case "unauthenticated":
        setStatus({ kind: "signed_out" });
        break;
      case "error":
        setStatus({ kind: "error", message: outcome.message });
        break;
    }
  }, [client, disabled, policy.cooldownMs, policy.dailyLimit, startCooldown]);

  const removeFloat = (id: string) => setFloats((list) => list.filter((f) => f.id !== id));
  const progress = Math.min(100, (tapsToday / policy.dailyLimit) * 100);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex flex-col items-center gap-6 py-10">
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm text-muted">Virtual balance</p>
          <AnimatedNumber value={balance} format={formatCoins} className="text-4xl font-bold sm:text-5xl" />
          <VirtualBadge className="mt-1" />
        </div>

        <div className="relative">
          {/* aria-disabled (not disabled) keeps keyboard focus on the button between taps. */}
          <button
            type="button"
            onClick={handleTap}
            aria-disabled={disabled}
            aria-describedby="tap-help"
            className={`flex size-44 items-center justify-center rounded-full text-white shadow-lg transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:size-52 ${tapSkinClass(tapSkin)}`}
          >
            <span key={pulseKey} className="animate-tap-pulse flex flex-col items-center gap-2">
              <Hand aria-hidden className="size-10" />
              <span className="text-lg font-semibold">
                {status.kind === "pending" ? "Recording…" : status.kind === "cooldown" ? "Cooling down" : "Tap to earn"}
              </span>
              <span className="text-xs opacity-90">+{policy.rewardCoins} VC per accepted tap</span>
            </span>
          </button>
          {floats.map((f) => (
            <span
              key={f.id}
              aria-hidden
              onAnimationEnd={() => removeFloat(f.id)}
              className="animate-reward-float pointer-events-none absolute left-1/2 top-0 z-10 rounded-full bg-success-surface px-3 py-1 text-sm font-semibold text-success-text tabular-nums"
            >
              +{f.amount} VC
            </span>
          ))}
        </div>

        <p id="tap-help" className="max-w-sm text-center text-xs text-muted">
          One accepted tap per {policy.cooldownMs / 1000} second, at most {formatCount(policy.perMinuteLimit)} a minute and {formatCount(policy.dailyLimit)} per UTC day. Robots earn far more over time.
          Rewards are recorded by the server.
        </p>

        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {badges.length > 0 ? (
          <Alert tone="success">
            New badge{badges.length > 1 ? "s" : ""} unlocked: {badges.map((a) => a.title).join(", ")}.{" "}
            <Link href="/achievements" className="font-semibold underline">
              See badges
            </Link>
          </Alert>
        ) : null}
        {status.kind === "limit" ? (
          <Alert tone="warning">Daily limit reached. Your taps reset at midnight UTC.</Alert>
        ) : null}
        {status.kind === "error" ? <Alert tone="danger">{status.message}</Alert> : null}
        {status.kind === "signed_out" ? (
          <Alert tone="danger">
            Your session has ended.{" "}
            <Link href="/login?next=/earn" className="font-semibold underline">
              Sign in again
            </Link>
          </Alert>
        ) : null}
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <p className="text-sm text-muted">Earned this session</p>
          <AnimatedNumber value={sessionEarned} format={formatCoins} className="text-2xl font-bold text-primary" />
        </Card>
        <Card>
          <p className="text-sm text-muted">Level</p>
          <p className="text-2xl font-bold tabular-nums">{xp.level}</p>
          <p className="mt-1 text-xs text-muted tabular-nums">
            {formatCount(xp.total)} XP · +{policy.xpPerTap} XP per tap
          </p>
        </Card>
        <Card>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">Taps today</span>
            <span className="font-semibold tabular-nums">
              {formatCount(tapsToday)} / {formatCount(policy.dailyLimit)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Daily taps used"
            aria-valuemin={0}
            aria-valuemax={policy.dailyLimit}
            aria-valuenow={tapsToday}
            className="h-2 overflow-hidden rounded-full bg-border"
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
