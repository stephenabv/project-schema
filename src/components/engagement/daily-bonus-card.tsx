"use client";

import { CalendarCheck, Flame } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { BonusClient } from "@/lib/api/bonus-client";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import type { DailyBonusStatus } from "@/lib/validation/engagement";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

/**
 * Once-per-UTC-day check-in. The server decides the streak and the amount;
 * after a claim the page data is refreshed so balances stay server-sourced.
 */
export function DailyBonusCard({ initialStatus }: { initialStatus: DailyBonusStatus }) {
  const client = useMemo(() => new BonusClient(), []);
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // One key per day's claim, so a retried click replays instead of double-claiming.
  const key = useRef<string | null>(null);

  async function claim() {
    if (pending || status.claimedToday) return;
    key.current ??= crypto.randomUUID();
    setPending(true);
    setNotice(null);
    try {
      const outcome = await client.claim(key.current);
      switch (outcome.kind) {
        case "success": {
          const { data } = outcome;
          setStatus((s) => ({ ...s, claimedToday: true, currentStreak: data.currentStreak, longestStreak: data.longestStreak }));
          const badges = data.unlockedAchievements.map((a) => a.title);
          setNotice({
            tone: "success",
            text:
              `Claimed +${formatCoins(data.rewardCoins)}. Day ${data.currentStreak} streak.` +
              (badges.length > 0 ? ` New badge: ${badges.join(", ")}.` : ""),
          });
          router.refresh();
          break;
        }
        case "already_claimed":
          setStatus((s) => ({ ...s, claimedToday: true }));
          setNotice({ tone: "warning", text: "You already claimed today's bonus." });
          break;
        case "unauthenticated":
          setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
          break;
        case "error":
          key.current = null;
          setNotice({ tone: "danger", text: outcome.message });
          break;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck aria-hidden className="size-4" /> Daily bonus
        </CardTitle>
        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums" aria-label={`Current streak ${status.currentStreak} days`}>
          <Flame aria-hidden className="size-4 text-orange-500" /> {formatCount(status.currentStreak)}-day streak
        </span>
      </div>
      <p className="text-sm text-muted">
        Check in every day to grow your streak. Longer streaks pay more virtual coins (best:{" "}
        {formatCount(status.longestStreak)} days).
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {status.claimedToday ? (
          <p className="text-sm font-semibold text-success-text">Claimed today. Come back tomorrow.</p>
        ) : (
          <Button onClick={claim} disabled={pending}>
            {pending ? "Claiming…" : `Claim +${formatCoins(status.nextRewardCoins)}`}
          </Button>
        )}
        <span className="text-xs text-muted">+{formatCount(status.xpReward)} XP · resets 00:00 UTC</span>
      </div>
      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone}>
            {notice.text}{" "}
            {notice.signedOut ? (
              <Link href="/login?next=/dashboard" className="font-semibold underline">
                Sign in again
              </Link>
            ) : null}
          </Alert>
        ) : null}
      </div>
    </Card>
  );
}
