"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { RedemptionClient } from "@/lib/api/redemption-client";
import { formatCount } from "@/lib/formatting/coins";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { formatPhp, parsePesosToCentavos } from "@/lib/formatting/money";
import { payoutRequestSchema, type Payout, type RedemptionOverview } from "@/lib/validation/redemption";
import { RequestTimeline, StatusPill } from "./request-status";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

const ERROR_TEXT: Record<string, string> = {
  AMOUNT_OUT_OF_RANGE: "That amount is outside the allowed range.",
  INSUFFICIENT_BALANCE: "You do not have enough converted pesos for that amount.",
  FEATURE_DISABLED: "Payouts are not available right now.",
  NOT_CONFIGURED: "Payouts are not set up yet.",
  INVALID_STATUS: "This request can no longer be cancelled.",
  ACCOUNT_SUSPENDED: "Your account is suspended, so payout requests are paused.",
};

/**
 * Payout requests against converted peso balance. Account details go to the
 * server once, are encrypted there, and only a masked hint ever comes back.
 * Submitting a request moves nothing: an admin pays by hand and must record
 * the payment reference before a request is shown as paid.
 */
export function PayoutPanel({
  overview,
  payouts,
  readOnly = false,
}: {
  overview: RedemptionOverview;
  payouts: Payout[];
  /** History only (the program is closed); pending requests can still be cancelled. */
  readOnly?: boolean;
}) {
  const client = useMemo(() => new RedemptionClient(), []);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [methodId, setMethodId] = useState(overview.methods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const { policy, php } = overview;
  const method = overview.methods.find((m) => m.id === methodId) ?? null;
  const centavos = amount.trim() === "" ? null : parsePesosToCentavos(amount);
  const amountError =
    amount.trim() === ""
      ? undefined
      : centavos === null
        ? "Enter pesos with up to two decimals"
        : centavos < policy.minPayoutCentavos
          ? `At least ${formatPhp(policy.minPayoutCentavos)}`
          : centavos > policy.maxPayoutCentavos
            ? `At most ${formatPhp(policy.maxPayoutCentavos)} per request`
            : centavos > php.availableCentavos
              ? `You have ${formatPhp(php.availableCentavos)} available`
              : undefined;
  // Same rules the server applies, so the form flags problems before submitting.
  const nameCheck = payoutRequestSchema.shape.accountName.safeParse(accountName);
  const numberCheck = payoutRequestSchema.shape.accountNumber.safeParse(accountNumber);
  const nameError = accountName && !nameCheck.success ? nameCheck.error.issues[0]?.message : undefined;
  const numberError = accountNumber && !numberCheck.success ? numberCheck.error.issues[0]?.message : undefined;
  const valid = method !== null && centavos !== null && amountError === undefined && nameCheck.success && numberCheck.success;

  function resetKey() {
    keyRef.current = null;
  }

  function refresh() {
    startRefresh(() => router.refresh());
  }

  function report(outcome: { kind: "unauthenticated" } | { kind: "error"; code?: string; message: string }) {
    if (outcome.kind === "unauthenticated") {
      setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
      return;
    }
    const known = outcome.code ? ERROR_TEXT[outcome.code] : undefined;
    setNotice({ tone: known ? "warning" : "danger", text: known ?? outcome.message });
    refresh();
  }

  async function submit() {
    if (!valid || !method || centavos === null || busy) return;
    keyRef.current ??= crypto.randomUUID();
    setBusy("submit");
    setNotice(null);
    try {
      const outcome = await client.requestPayout({
        methodId: method.id,
        amountCentavos: centavos,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        idempotencyKey: keyRef.current,
      });
      if (outcome.kind === "success") {
        keyRef.current = null;
        setAmount("");
        setAccountName("");
        setAccountNumber("");
        setReviewing(false);
        setNotice({
          tone: "success",
          text: `Payout request ${outcome.data.reference} for ${formatPhp(outcome.data.amountCentavos)} was submitted. We will review it and send your money once it is approved.`,
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

  async function cancel(payout: Payout) {
    if (busy) return;
    setBusy(payout.id);
    setNotice(null);
    try {
      const outcome = await client.cancelPayout(payout.id);
      if (outcome.kind === "success") {
        setNotice({ tone: "success", text: `Payout request ${payout.reference} was cancelled and the amount is back in your balance.` });
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
              <Link href="/login?next=/payouts" className="font-semibold underline">
                Sign in again
              </Link>
            ) : null}
          </Alert>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Balance label="Available" value={php.availableCentavos} hint="Ready to request" />
        <Balance label="In payout requests" value={php.reservedCentavos} hint="Waiting to be sent" />
        <Balance label="Paid out" value={php.paidCentavos} hint="Already sent to you" />
      </dl>

      {readOnly ? null : overview.methods.length === 0 ? (
        <Alert tone="warning">No payout methods are available right now.</Alert>
      ) : (
        <Card className="flex flex-col gap-4">
          <CardTitle>New payout request</CardTitle>
          {reviewing && valid && method && centavos !== null ? (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-background p-4 text-sm">
                <dt className="text-muted">Amount</dt>
                <dd className="text-right font-semibold tabular-nums">{formatPhp(centavos)}</dd>
                <dt className="text-muted">Method</dt>
                <dd className="text-right">{method.name}</dd>
                <dt className="text-muted">Account name</dt>
                <dd className="text-right">{accountName.trim()}</dd>
                <dt className="text-muted">{method.accountLabel}</dt>
                <dd className="text-right font-mono">{accountNumber.trim()}</dd>
              </dl>
              <p className="text-xs text-muted">
                Please double-check your details. We usually send payouts within{" "}
                {formatCount(policy.processingDays)} days. You can cancel while it is pending.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={submit} disabled={busy !== null}>
                  {busy === "submit" ? "Submitting…" : "Submit payout request"}
                </Button>
                <Button variant="ghost" onClick={() => setReviewing(false)} disabled={busy !== null}>
                  Edit
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) setReviewing(true);
              }}
            >
              <SelectField
                label="Payout method"
                name="methodId"
                value={methodId}
                onChange={(event) => {
                  setMethodId(event.target.value);
                  resetKey();
                }}
                options={overview.methods.map((m) => ({ value: m.id, label: m.name }))}
              />
              <Field
                label="Amount (PHP)"
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  resetKey();
                }}
                error={amountError}
                hint={`Between ${formatPhp(policy.minPayoutCentavos)} and ${formatPhp(policy.maxPayoutCentavos)}.`}
              />
              <Field
                label="Account holder name"
                name="accountName"
                autoComplete="name"
                maxLength={80}
                value={accountName}
                onChange={(event) => {
                  setAccountName(event.target.value);
                  resetKey();
                }}
                error={nameError}
              />
              <Field
                label={method?.accountLabel ?? "Account number"}
                name="accountNumber"
                autoComplete="off"
                maxLength={64}
                value={accountNumber}
                onChange={(event) => {
                  setAccountNumber(event.target.value);
                  resetKey();
                }}
                error={numberError}
                hint="Kept private. We only show the last four digits."
              />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!valid || refreshing}>
                  Review request
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <CardTitle>Your payout requests</CardTitle>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted">No payout requests yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{p.reference}</p>
                    <p className="text-xs text-muted">
                      {p.methodName} · {p.accountHint} · {formatDateTimeUtc(p.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{formatPhp(p.amountCentavos)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={p.status} />
                  {p.status === "paid" && p.paymentReference ? (
                    <span className="text-xs text-muted">Payment ref. {p.paymentReference}</span>
                  ) : null}
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    aria-expanded={expanded === p.id}
                  >
                    {expanded === p.id ? "Hide details" : "Details"}
                  </Button>
                  {p.status === "pending" ? (
                    <Button variant="secondary" onClick={() => cancel(p)} disabled={busy !== null}>
                      {busy === p.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  ) : null}
                </div>
                {p.rejectionReason ? <p className="text-xs text-danger-text">Reason: {p.rejectionReason}</p> : null}
                {expanded === p.id ? <RequestTimeline events={p.events} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Balance({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-sm">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{formatPhp(value)}</dd>
      <dd className="text-xs text-muted">{hint}</dd>
    </div>
  );
}
