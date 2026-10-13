"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { RobotClient } from "@/lib/api/robot-client";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { coinsPerMinute, paybackHours, type RobotShop as RobotShopData, type ShopRobot } from "@/lib/validation/robots";
import { RobotArt, TierBadge } from "./robot-art";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

const BLOCKER_TEXT: Record<NonNullable<ShopRobot["blocker"]>, (robot: ShopRobot) => string> = {
  unlisted: () => "Not on sale right now",
  robot_limit: (r) => `You own the maximum of ${r.maxPerUser}`,
  total_limit: () => "You own the maximum number of robots",
  level: (r) => `Reach level ${r.levelRequired}`,
};

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Not enough virtual coins for this robot yet.",
  LIMIT_REACHED: "You already own the maximum allowed for this robot.",
  LEVEL_REQUIRED: "Your level is too low for this robot.",
  FEATURE_DISABLED: "Robots are turned off right now.",
};

/**
 * Robot Shop. Prices, rates and limits come from the server, which also
 * checks balance, level and ownership limits and charges exactly once per
 * idempotency key, so a retried or double-clicked purchase never charges twice.
 */
export function RobotShop({ initialShop }: { initialShop: RobotShopData }) {
  const client = useMemo(() => new RobotClient(), []);
  const [shop, setShop] = useState(initialShop);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // One key per robot until a definitive answer, so retries replay instead of buying twice.
  const keys = useRef(new Map<string, string>());

  async function buy(robot: ShopRobot) {
    if (pendingId) return;
    const key = keys.current.get(robot.id) ?? crypto.randomUUID();
    keys.current.set(robot.id, key);
    setPendingId(robot.id);
    setNotice(null);
    try {
      const outcome = await client.purchase(robot.id, key);
      if (outcome.kind === "success") {
        keys.current.delete(robot.id);
        const { activated, balanceCoins, duplicate } = outcome.data;
        setShop((s) => {
          const ownedCount = s.ownedCount + (duplicate ? 0 : 1);
          const activeCount = s.activeCount + (duplicate || !activated ? 0 : 1);
          return {
            ...s,
            balanceCoins,
            ownedCount,
            activeCount,
            robots: s.robots.map((r) => {
              if (r.id !== robot.id || duplicate) return r;
              const owned = r.ownedCount + 1;
              const active = r.activeCount + (activated ? 1 : 0);
              return {
                ...r,
                ownedCount: owned,
                activeCount: active,
                status: active > 0 ? "active" : "owned",
                blocker: owned >= r.maxPerUser ? "robot_limit" : r.blocker,
              };
            }),
          };
        });
        setNotice({
          tone: "success",
          text: `${robot.name} joined your team for ${formatCoins(robot.priceCoins)} (virtual). ${
            activated ? "It started working right away." : "All work slots are busy, so activate it from My Robots."
          }`,
        });
      } else if (outcome.kind === "unauthenticated") {
        setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
      } else {
        keys.current.delete(robot.id);
        setNotice({ tone: outcome.code && outcome.code in ERROR_TEXT ? "warning" : "danger", text: ERROR_TEXT[outcome.code ?? ""] ?? outcome.message });
      }
    } finally {
      setPendingId(null);
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Virtual balance</CardTitle>
          <p className="text-2xl font-bold tabular-nums">{formatCoins(shop.balanceCoins)}</p>
          <VirtualBadge className="mt-1" />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Owned</dt>
          <dd className="text-right font-semibold tabular-nums">
            {formatCount(shop.ownedCount)} / {formatCount(shop.maxOwned)}
          </dd>
          <dt className="text-muted">Working</dt>
          <dd className="text-right font-semibold tabular-nums">
            {formatCount(shop.activeCount)} / {formatCount(shop.maxActive)}
          </dd>
        </dl>
        <ButtonLink href="/generator" variant="secondary">
          My robots
        </ButtonLink>
      </Card>

      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone}>
            {notice.text}{" "}
            {notice.signedOut ? (
              <Link href="/login?next=/robots" className="font-semibold underline">
                Sign in again
              </Link>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {shop.robots.length === 0 ? (
        <Card className="text-center text-sm text-muted">No robots are on sale right now. Check back later.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shop.robots.map((robot) => {
            const affordable = shop.balanceCoins >= robot.priceCoins;
            const blocked = robot.blocker !== null;
            const busy = pendingId === robot.id;
            return (
              <li key={robot.id}>
                <Card className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <RobotArt imageKey={robot.imageKey} tier={robot.tier} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{robot.name}</h3>
                        <TierBadge tier={robot.tier} />
                      </div>
                      <p className="mt-1 text-sm text-muted">{robot.description}</p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-3 gap-2 rounded-xl bg-background p-3 text-center text-xs">
                    <div>
                      <dt className="text-muted">Per minute</dt>
                      <dd className="text-sm font-semibold tabular-nums">{coinsPerMinute(robot.coinsPerHour)} VC</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Per hour</dt>
                      <dd className="text-sm font-semibold tabular-nums">{formatCount(robot.coinsPerHour)} VC</dd>
                    </div>
                    <div>
                      <dt className="text-muted">24 hours</dt>
                      <dd className="text-sm font-semibold tabular-nums">{formatCount(robot.coinsPer24h)} VC</dd>
                    </div>
                  </dl>

                  <ul className="flex flex-col gap-1 text-xs text-muted">
                    <li>
                      Level {formatCount(robot.levelRequired)} or higher · up to {formatCount(robot.maxPerUser)} per player
                    </li>
                    <li>Pays back its price in about {formatCount(paybackHours(robot.priceCoins, robot.coinsPerHour))} working hours</li>
                    <li>
                      {robot.ownedCount > 0
                        ? `You own ${formatCount(robot.ownedCount)} (${formatCount(robot.activeCount)} working)`
                        : "You do not own this robot yet"}
                    </li>
                  </ul>

                  <div className="mt-auto flex flex-col gap-2">
                    <p className="text-lg font-bold tabular-nums">{formatCoins(robot.priceCoins)}</p>
                    {blocked ? (
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <Lock aria-hidden className="size-4" />
                        {BLOCKER_TEXT[robot.blocker!](robot)}
                      </p>
                    ) : confirming === robot.id ? (
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => buy(robot)} disabled={busy} aria-label={`Confirm buying ${robot.name}`}>
                          {busy ? "Buying…" : `Confirm ${formatCoins(robot.priceCoins)}`}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setConfirming(robot.id)}
                        disabled={pendingId !== null || !affordable}
                        aria-label={`Buy ${robot.name} for ${formatCoins(robot.priceCoins)}`}
                      >
                        {affordable ? "Buy" : "Not enough VC"}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted">
        Each robot holds up to {formatCount(shop.accrualCapHours)} hours of earnings, so collect often to keep
        them working.
      </p>
    </div>
  );
}
