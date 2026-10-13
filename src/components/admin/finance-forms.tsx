"use client";

import { useActionState, useState } from "react";
import {
  savePayoutMethod,
  setExchangeRate,
  transitionConversion,
  transitionPayout,
  updateRedemptionPolicy,
} from "@/app/admin/finance-actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import type { FormState } from "@/lib/auth/form-state";
import { centavosToInput } from "@/lib/formatting/money";
import {
  CONVERSION_TRANSITIONS,
  ENABLE_CONFIRMATION,
  PAYOUT_TRANSITIONS,
  STATUS_LABELS,
  type AdminPayoutMethod,
  type ConversionStatus,
  type ExchangeRate,
  type PayoutStatus,
  type RedemptionPolicy,
} from "@/lib/validation/redemption";

/** Records a new VC-to-PHP rate. Large changes need an explicit confirmation. */
export function ExchangeRateForm({ current }: { current: ExchangeRate | null }) {
  const initial: FormState = {
    status: "idle",
    values: {
      rateCoins: String(current?.rateCoins ?? 1000),
      ratePesos: current ? centavosToInput(current.rateCentavos) : "",
      effectiveAt: "",
      reason: "",
      confirmLargeChange: "",
    },
  };
  const [state, action] = useActionState(setExchangeRate, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const formKey = state.status === "success" ? state.message : "form";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="VC amount" name="rateCoins" type="number" min={1} defaultValue={v.rateCoins} error={e.rateCoins} />
        <Field
          label="Equals pesos"
          name="ratePesos"
          inputMode="decimal"
          defaultValue={v.ratePesos}
          hint="For example 10.00"
          error={e.ratePesos}
        />
        <Field
          label="Effective from (UTC, optional)"
          name="effectiveAt"
          type="datetime-local"
          defaultValue={v.effectiveAt}
          hint="Leave empty for now."
          error={e.effectiveAt}
        />
      </div>
      <Field label="Reason" name="reason" maxLength={280} defaultValue={v.reason} required error={e.reason} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirmLargeChange" defaultChecked={v.confirmLargeChange === "on"} className="size-4 accent-primary" />
        I confirm a change of more than 25% from the current rate
      </label>
      <SubmitButton pendingLabel="Saving…">Set exchange rate</SubmitButton>
    </form>
  );
}

/** Opens or closes conversion and payouts, and sets their limits. */
export function RedemptionPolicyForm({ policy }: { policy: RedemptionPolicy }) {
  const initial: FormState = {
    status: "idle",
    values: {
      enabled: policy.enabled ? "true" : "false",
      minConversionCoins: String(policy.minConversionCoins),
      maxConversionCoins: String(policy.maxConversionCoins),
      minPayoutPesos: centavosToInput(policy.minPayoutCentavos),
      maxPayoutPesos: centavosToInput(policy.maxPayoutCentavos),
      processingDays: String(policy.processingDays),
      reason: "",
      confirmation: "",
    },
  };
  const [state, action] = useActionState(updateRedemptionPolicy, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const [enabled, setEnabled] = useState(v.enabled === "true");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <SelectField
        label="Program status"
        name="enabled"
        value={enabled ? "true" : "false"}
        onChange={(event) => setEnabled(event.target.value === "true")}
        options={[
          { value: "false", label: "Closed (default): no new requests" },
          { value: "true", label: "Open: players can request conversion and payouts" },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Min conversion (VC)" name="minConversionCoins" type="number" min={1} defaultValue={v.minConversionCoins} error={e.minConversionCoins} />
        <Field label="Max conversion (VC)" name="maxConversionCoins" type="number" min={1} defaultValue={v.maxConversionCoins} error={e.maxConversionCoins} />
        <Field label="Min payout (PHP)" name="minPayoutPesos" inputMode="decimal" defaultValue={v.minPayoutPesos} error={e.minPayoutPesos} />
        <Field label="Max payout (PHP)" name="maxPayoutPesos" inputMode="decimal" defaultValue={v.maxPayoutPesos} error={e.maxPayoutPesos} />
        <Field label="Processing time (days)" name="processingDays" type="number" min={1} max={60} defaultValue={v.processingDays} error={e.processingDays} />
        <Field label="Reason" name="reason" maxLength={280} defaultValue={v.reason} required error={e.reason} />
      </div>
      {enabled && !policy.enabled ? (
        <div className="flex flex-col gap-2 rounded-xl bg-warning-surface p-4 text-sm text-warning-text">
          <p>
            Only open the program once real-money payouts are legally cleared (licensing, KYC and anti-money-laundering checks,
            tax and terms). Every payout must still be sent and verified by hand.
          </p>
          <Field
            label={`Type ${ENABLE_CONFIRMATION} to confirm`}
            name="confirmation"
            autoComplete="off"
            defaultValue=""
            error={e.confirmation}
          />
        </div>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save program settings</SubmitButton>
    </form>
  );
}

export function PayoutMethodForm({ method }: { method?: AdminPayoutMethod }) {
  const initial: FormState = {
    status: "idle",
    values: {
      code: method?.code ?? "",
      name: method?.name ?? "",
      accountLabel: method?.accountLabel ?? "Account number",
      isActive: method ? (method.isActive ? "on" : "") : "on",
      sortOrder: String(method?.sortOrder ?? 100),
    },
  };
  const [state, action] = useActionState(savePayoutMethod, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const prefix = method?.id ?? "new-method";
  const formKey = !method && state.status === "success" ? state.message : "form";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={method?.id ?? ""} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field id={`${prefix}-code`} label="Code" name="code" defaultValue={v.code} error={e.code} />
        <Field id={`${prefix}-name`} label="Name" name="name" defaultValue={v.name} error={e.name} />
        <Field id={`${prefix}-label`} label="Account field label" name="accountLabel" defaultValue={v.accountLabel} error={e.accountLabel} />
        <Field id={`${prefix}-sort`} label="Sort order" name="sortOrder" type="number" defaultValue={v.sortOrder} error={e.sortOrder} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={v.isActive === "on"} className="size-4 accent-primary" />
        Offered to players
      </label>
      <SubmitButton pendingLabel="Saving…">{method ? "Save method" : "Add method"}</SubmitButton>
    </form>
  );
}

/** Moves a conversion request along its allowed transitions. */
export function ConversionReviewForm({ id, status }: { id: string; status: ConversionStatus }) {
  const options = CONVERSION_TRANSITIONS[status];
  const [state, action] = useActionState(transitionConversion, { status: "idle" } as FormState);
  const [to, setTo] = useState<string>(options[0] ?? "");
  const e = state.fieldErrors ?? {};
  if (options.length === 0) return <p className="text-xs text-muted">No further actions: this request is final.</p>;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField
          id={`${id}-to`}
          label="Move to"
          name="to"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          options={options.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          error={e.to}
        />
        <Field id={`${id}-note`} label="Internal note (optional)" name="note" maxLength={500} error={e.note} />
        <Field
          id={`${id}-reason`}
          label={to === "rejected" ? "Rejection reason (shown to player)" : "Reason (optional)"}
          name="reason"
          maxLength={280}
          error={e.reason}
        />
      </div>
      {to === "completed" ? (
        <p className="text-xs text-muted">Completing credits the peso amount to the player&apos;s converted balance and consumes the reserved VC.</p>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Update request</SubmitButton>
    </form>
  );
}

/**
 * Moves a payout request along its allowed transitions. Marking it paid needs
 * the payment channel's reference and an explicit confirmation that the
 * transfer was verified: there is no payment provider behind this app.
 */
export function PayoutReviewForm({ id, status }: { id: string; status: PayoutStatus }) {
  const options = PAYOUT_TRANSITIONS[status];
  const [state, action] = useActionState(transitionPayout, { status: "idle" } as FormState);
  const [to, setTo] = useState<string>(options[0] ?? "");
  const e = state.fieldErrors ?? {};
  if (options.length === 0) return <p className="text-xs text-muted">No further actions: this request is final.</p>;
  const needsReason = to === "rejected" || to === "failed" || to === "refunded";

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField
          id={`${id}-to`}
          label="Move to"
          name="to"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          options={options.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          error={e.to}
        />
        <Field id={`${id}-note`} label="Internal note (optional)" name="note" maxLength={500} error={e.note} />
        <Field
          id={`${id}-reason`}
          label={needsReason ? "Reason (shown to player)" : "Reason (optional)"}
          name="reason"
          maxLength={280}
          error={e.reason}
        />
      </div>
      {to === "paid" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-warning-surface p-4 text-sm text-warning-text">
          <Field
            id={`${id}-payment-reference`}
            label="Payment reference from the payment channel"
            name="paymentReference"
            maxLength={100}
            error={e.paymentReference}
          />
          <label className="flex items-start gap-2">
            <input type="checkbox" name="verified" className="mt-0.5 size-4 accent-primary" />
            I sent this payment myself and verified in the payment channel that it was completed.
          </label>
          {e.verified ? <p className="text-xs text-danger-text">{e.verified}</p> : null}
        </div>
      ) : (
        <input type="hidden" name="paymentReference" value="" />
      )}
      <SubmitButton pendingLabel="Saving…">Update payout</SubmitButton>
    </form>
  );
}
