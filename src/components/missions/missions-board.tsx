"use client";

import { CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ClaimClient } from "@/lib/api/claim-client";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { describeMissionGoal, frequencyLabel } from "@/lib/formatting/progression";
import type { Mission, UnlockedAchievement } from "@/types/api";

const MISSION_GROUPS: readonly { frequency: Mission["frequency"]; heading: string }[] = [
  { frequency: "daily", heading: "Daily missions" },
  { frequency: "weekly", heading: "Weekly challenges" },
  { frequency: "once", heading: "One-time goals" },
];

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

/**
 * Lists the current period's missions. Progress comes from the server; the
 * claim button only asks the server to check eligibility and pay out.
 */
export function MissionsBoard({ initialMissions }: { initialMissions: Mission[] }) {
  const client = useMemo(() => new ClaimClient(), []);
  const [missions, setMissions] = useState(initialMissions);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // One key per mission and period, so a retried click is a replay, not a second claim.
  const keys = useRef(new Map<string, string>());

  const markClaimed = useCallback((id: string) => {
    setMissions((list) =>
      list.map((m) => (m.id === id ? { ...m, claimed: true, claimedAt: new Date().toISOString() } : m)),
    );
  }, []);

  const claim = useCallback(
    async (mission: Mission) => {
      if (pendingId) return;
      const keyId = `${mission.id}:${mission.periodKey}`;
      const key = keys.current.get(keyId) ?? crypto.randomUUID();
      keys.current.set(keyId, key);
      setPendingId(mission.id);
      setNotice(null);

      try {
        const outcome = await client.claim(mission.id, key);
        switch (outcome.kind) {
          case "success":
            markClaimed(mission.id);
            setNotice({ tone: "success", text: claimMessage(mission, outcome.data.unlockedAchievements) });
            break;
          case "already_claimed":
            markClaimed(mission.id);
            setNotice({ tone: "warning", text: "You already claimed this mission for the current period." });
            break;
          case "incomplete":
            setNotice({ tone: "warning", text: "This mission is not complete yet. Keep going!" });
            break;
          case "unauthenticated":
            setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
            break;
          case "error":
            keys.current.delete(keyId);
            setNotice({ tone: "danger", text: outcome.message });
            break;
        }
      } finally {
        setPendingId(null);
      }
    },
    [client, markClaimed, pendingId],
  );

  if (missions.length === 0) {
    return (
      <Card className="text-center text-sm text-muted">No missions are live right now. Check back soon.</Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone}>
            {notice.text}{" "}
            {notice.signedOut ? (
              <Link href="/login?next=/missions" className="font-semibold underline">
                Sign in again
              </Link>
            ) : null}
          </Alert>
        ) : null}
      </div>
      {MISSION_GROUPS.map(({ frequency, heading }) => {
        const group = missions.filter((m) => m.frequency === frequency);
        if (group.length === 0) return null;
        return (
          <section key={frequency} aria-labelledby={`missions-${frequency}`} className="flex flex-col gap-3">
            <h2 id={`missions-${frequency}`} className="text-sm font-semibold uppercase tracking-wide text-muted">
              {heading}
            </h2>
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {group.map((mission) => (
                <li key={mission.id}>
                  <MissionCard mission={mission} pending={pendingId === mission.id} onClaim={claim} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MissionCard({
  mission,
  pending,
  onClaim,
}: {
  mission: Mission;
  pending: boolean;
  onClaim: (mission: Mission) => void;
}) {
  const complete = mission.progress >= mission.target;

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {frequencyLabel(mission.frequency)}
          </span>
          <h2 className="text-base font-semibold">{mission.title}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-success-surface px-2.5 py-1 text-xs font-semibold text-success-text tabular-nums">
          +{formatCoins(mission.rewardCoins)}
          {mission.xpReward > 0 ? ` · ${formatCount(mission.xpReward)} XP` : ""}
        </span>
      </div>
      <p className="text-sm text-muted">{mission.description}</p>
      <ProgressBar value={mission.progress} max={mission.target} label={`${mission.title} progress`} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted tabular-nums">{describeMissionGoal(mission)}</span>
        {mission.claimed ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-success-text">
            <CheckCircle2 aria-hidden className="size-4" /> Claimed
          </span>
        ) : (
          <Button
            onClick={() => onClaim(mission)}
            disabled={!complete || pending}
            aria-label={`Claim ${mission.title}`}
          >
            {pending ? "Claiming…" : complete ? "Claim reward" : "In progress"}
          </Button>
        )}
      </div>
      {mission.periodEndsAt && !mission.claimed ? (
        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock aria-hidden className="size-3" /> Resets {formatReset(mission.periodEndsAt)}
        </p>
      ) : null}
    </Card>
  );
}

const resetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

function formatReset(iso: string): string {
  return resetFormat.format(new Date(iso));
}

function claimMessage(mission: Mission, unlocked: UnlockedAchievement[]): string {
  const base = `Claimed ${mission.title}: +${formatCoins(mission.rewardCoins)} (virtual, non-redeemable).`;
  if (unlocked.length === 0) return base;
  return `${base} New badge${unlocked.length > 1 ? "s" : ""}: ${unlocked.map((a) => a.title).join(", ")}.`;
}
