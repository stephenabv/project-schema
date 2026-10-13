"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { RedemptionClient } from "@/lib/api/redemption-client";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { estimateCentavos, formatPhp, formatRate } from "@/lib/formatting/money";
import type { Conversion, RedemptionOverview } from "@/lib/validation/redemption";
import { RequestTimeline, StatusPill } from "./request-status";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

const ERROR_TEXT: Record<string, string> = {
  RATE_CHANGED: "The exchange rate just changed. Please check the new amount before you submit.",
  AMOUNT_OUT_OF_RANGE: "That amount is outside the allowed range.",
  INSUFFICIENT_BALANCE: "You do not have enough eligible VC for that amount.",
  FEATURE_DISABLED: "Conversion is not available right now.",
  NOT_CONFIGURED: "Conversion is not set up yet.",
  INVALID_STATUS: "This request can no longer be cancelled.",
};

/**
 * VC-to-PHP conversion requests. The estimate is a preview only: the server
 * re-reads the rate, rejects the request if it changed since this page loaded,
 * computes the peso amount itself and snapshots the rate on the request.
 */
export function ConversionPanel({
  overview,
  conversions,
  readOnly = false,
}: {
  overview: RedemptionOverview;
  conversions: Conversion[];
  /** History only (the program is closed); pending requests can still be cancelled. */
  readOnly?: boolean;
}) {
  const client = useMemo(() => new RedemptionClient(), []);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [amount, setAmount] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const { rate, policy, coins } = overview;
  const parsed = /^\d{1,10}$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const amountError =
    amount.trim() === ""
      ? undefined
      : parsed === null
        ? "Use a whole number of VC"
        : parsed < policy.minConversionCoins
          ? `At least ${formatCoins(policy.minConversionCoins)}`
          : parsed > policy.maxConversionCoins
            ? `At most ${formatCoins(policy.maxConversionCoins)} per request`
            : parsed > coins.eligibleCoins
              ? `You have ${formatCoins(coins.eligibleCoins)} available`
              : undefined;
  const valid = parsed !== null && amountError === undefined && rate !== null;
  const estimate = valid && rate ? estimateCentavos(parsed, rate.rateCoins, rate.rateCentavos) : 0;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  /** Shows a failure and re-reads the page, since rates, limits and statuses may have moved on. */
  function report(outcome: { kind: "unauthenticated" } | { kind: "error"; code?: string; message: string }) {
    if (outcome.kind === "unauthenticated") {
      setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
      return;
    }
    const known = outcome.code ? ERROR_TEXT[outcome.code] : undefined;
    setNotice({ tone: known ? "warning" : "danger", text: known ?? outcome.message });
    if (outcome.code === "RATE_CHANGED") setReviewing(false);
    refresh();
  }

  async function submit() {
    if (!valid || !rate || busy) return;
    keyRef.current ??= crypto.randomUUID();
    setBusy("submit");
    setNotice(null);
    try {
      const outcome = await client.requestConversion(parsed, rate.id, keyRef.current);
      if (outcome.kind === "success") {
        keyRef.current = null;
        setAmount("");
        setReviewing(false);
        setNotice({
          tone: "success",
          text: `Request ${outcome.data.reference} submitted for ${formatCoins(outcome.data.coins)}. Those coins are set aside while we review it.`,
        });
        refresh();
      } else {
        if (outcome.kind === "error") keyRef.current = null;
        report(outcome);
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancel(conversion: Conversion) {
    if (busy) return;
    setBusy(conversion.id);
    setNotice(null);
    try {
      const outcome = await client.cancelConversion(conversion.id);
      if (outcome.kind === "success") {
        setNotice({ tone: "success", text: `Request ${conversion.reference} was cancelled and the coins are back in your balance.` });
        refresh();
      } else {
        report(outcome);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone}>
            {notice.text}{" "}
            {notice.signedOut ? (
              <Link href="/login?next=/exchange" className="font-semibold underline">
                Sign in again
              </Link>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {readOnly ? null : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex flex-col gap-4">
          <CardTitle>New conversion request</CardTitle>
          {rate ? (
            <p className="text-sm">
              Current rate <span className="font-semibold">{formatRate(rate.rateCoins, rate.rateCentavos)}</span>
              <span className="text-muted"> · since {formatDateTimeUtc(rate.effectiveAt)}</span>
            </p>
          ) : null}
          {reviewing && valid ? (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-background p-4 text-sm">
                <dt className="text-muted">You convert</dt>
                <dd className="text-right font-semibold tabular-nums">{formatCoins(parsed)}</dd>
                <dt className="text-muted">Estimated pesos</dt>
                <dd className="text-right font-semibold tabular-nums">{formatPhp(estimate)}</dd>
                <dt className="text-muted">Rate</dt>
                <dd className="text-right tabular-nums">{rate ? formatRate(rate.rateCoins, rate.rateCentavos) : null}</dd>
              </dl>
              <p className="text-xs text-muted">
                Your coins are set aside once you submit. If you cancel or the request is declined, they go back to your
                balance. Your pesos are added once we approve the request, usually within{" "}
                {formatCount(policy.processingDays)} days.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={submit} disabled={busy !== null}>
                  {busy === "submit" ? "Submitting…" : "Submit request"}
                </Button>
                <Button variant="ghost" onClick={() => setReviewing(false)} disabled={busy !== null}>
                  Edit
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) setReviewing(true);
              }}
            >
              <Field
                label="Amount (VC)"
                name="coins"
                inputMode="numeric"
                autoComplete="off"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  keyRef.current = null;
                }}
                error={amountError}
                hint={`Between ${formatCoins(policy.minConversionCoins)} and ${formatCoins(policy.maxConversionCoins)}.`}
              />
              <p className="text-sm text-muted">
                Estimated: <span className="font-semibold text-foreground tabular-nums">{formatPhp(estimate)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={!valid || refreshing}>
                  Review request
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setAmount(String(Math.min(coins.eligibleCoins, policy.maxConversionCoins)))}
                  disabled={coins.eligibleCoins < policy.minConversionCoins}
                >
                  Use maximum
                </Button>
              </div>
            </form>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-2">
            <CardTitle>Eligible to convert</CardTitle>
            <p className="text-2xl font-bold tabular-nums">{formatCoins(coins.eligibleCoins)}</p>
            <VirtualBadge />
            <p className="text-xs text-muted">{formatCoins(coins.reservedCoins)} set aside for pending requests.</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <CardTitle>Converted pesos</CardTitle>
            <p className="text-2xl font-bold tabular-nums">{formatPhp(overview.php.availableCentavos)}</p>
            <p className="text-xs text-muted">Ready to request as a payout.</p>
            <ButtonLink href="/payouts" variant="secondary">
              Payouts
            </ButtonLink>
          </Card>
        </div>
      </div>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>Your conversion requests</CardTitle>
        {conversions.length === 0 ? (
          <p className="text-sm text-muted">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {conversions.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{c.reference}</p>
                    <p className="text-xs text-muted">{formatDateTimeUtc(c.createdAt)}</p>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <p className="font-semibold">{formatCoins(c.coins)}</p>
                    <p className="text-muted">{formatPhp(c.phpCentavos)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={c.status} />
                  <span className="text-xs text-muted">at {formatRate(c.rateCoins, c.rateCentavos)}</span>
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    aria-expanded={expanded === c.id}
                  >
                    {expanded === c.id ? "Hide details" : "Details"}
                  </Button>
                  {c.status === "pending" ? (
                    <Button variant="secondary" onClick={() => cancel(c)} disabled={busy !== null}>
                      {busy === c.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  ) : null}
                </div>
                {c.rejectionReason ? <p className="text-xs text-danger-text">Reason: {c.rejectionReason}</p> : null}
                {expanded === c.id ? <RequestTimeline events={c.events} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
