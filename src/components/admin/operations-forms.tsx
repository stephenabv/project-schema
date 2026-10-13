"use client";

import { useActionState } from "react";
import { scheduleTask, setMaintenance, updateFeatureFlags } from "@/app/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/form-state";
import {
  FEATURE_FLAGS,
  FEATURE_LABELS,
  toUtcInputValue,
  type FeatureFlags,
  type MaintenanceStatus,
} from "@/lib/validation/operations";

/** Turns player features on or off. The database enforces the flags on every reward. */
export function FeatureFlagsForm({ flags }: { flags: FeatureFlags }) {
  const initial: FormState = {
    status: "idle",
    values: Object.fromEntries(FEATURE_FLAGS.map((f) => [f, flags[f] ? "on" : ""])),
  };
  const [state, action] = useActionState(updateFeatureFlags, initial);
  const v = state.values ?? initial.values!;

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="sr-only">Features</legend>
        {FEATURE_FLAGS.map((flag) => (
          <label key={flag} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={flag} defaultChecked={v[flag] === "on"} className="size-4 accent-primary" />
            {FEATURE_LABELS[flag]}
          </label>
        ))}
      </fieldset>
      <SubmitButton pendingLabel="Saving…">Save features</SubmitButton>
    </form>
  );
}

/** Pauses or resumes every reward and purchase. Admin adjustments keep working. */
export function MaintenanceForm({ maintenance }: { maintenance: MaintenanceStatus }) {
  const initial: FormState = { status: "idle", values: { message: maintenance.message } };
  const [state, action] = useActionState(setMaintenance, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const enabled = state.status === "success" ? state.values?.enabled === "true" : maintenance.enabled;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <p className="text-sm">
        Status:{" "}
        <span className={enabled ? "font-semibold text-warning-text" : "font-semibold text-success-text"}>
          {enabled ? "maintenance on" : "running normally"}
        </span>
      </p>
      <Field
        label="Message for players (optional)"
        name="message"
        maxLength={200}
        defaultValue={v.message}
        hint="Shown in the maintenance banner. Up to 200 characters."
        error={e.message}
      />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <SubmitButton pendingLabel="Saving…">{enabled ? "Turn maintenance off" : "Turn maintenance on"}</SubmitButton>
    </form>
  );
}

/** Sets a mission's publishing window (UTC). Empty fields mean no limit. */
export function ScheduleForm({
  taskId,
  publishAt,
  unpublishAt,
}: {
  taskId: string;
  publishAt: string | null;
  unpublishAt: string | null;
}) {
  const initial: FormState = {
    status: "idle",
    values: { taskId, publishAt: toUtcInputValue(publishAt), unpublishAt: toUtcInputValue(unpublishAt) },
  };
  const [state, action] = useActionState(scheduleTask, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="taskId" value={taskId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          id={`publishAt-${taskId}`}
          label="Starts (UTC)"
          name="publishAt"
          type="datetime-local"
          defaultValue={v.publishAt}
          hint="Empty: live as soon as it is published"
          error={e.publishAt}
        />
        <Field
          id={`unpublishAt-${taskId}`}
          label="Ends (UTC)"
          name="unpublishAt"
          type="datetime-local"
          defaultValue={v.unpublishAt}
          hint="Empty: no end date"
          error={e.unpublishAt}
        />
      </div>
      <SubmitButton pendingLabel="Saving…">Save schedule</SubmitButton>
    </form>
  );
}
