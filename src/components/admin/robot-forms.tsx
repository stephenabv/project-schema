"use client";

import { useActionState } from "react";
import { saveRobot, updateRobotPolicy } from "@/app/admin/finance-actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import type { FormState } from "@/lib/auth/form-state";
import {
  ROBOT_IMAGE_KEYS,
  ROBOT_TIERS,
  TIER_LABELS,
  type AdminRobot,
  type RobotPolicy,
} from "@/lib/validation/robots";

const TIERS = ROBOT_TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }));
const IMAGES = ROBOT_IMAGE_KEYS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }));
const STATUSES = [
  { value: "draft", label: "Draft (hidden)" },
  { value: "active", label: "Active (on sale)" },
  { value: "inactive", label: "Inactive (not on sale)" },
  { value: "archived", label: "Archived" },
] as const;

function initialValues(robot?: AdminRobot): Record<string, string> {
  return {
    id: robot?.id ?? "",
    slug: robot?.slug ?? "",
    name: robot?.name ?? "",
    description: robot?.description ?? "",
    tier: robot?.tier ?? "common",
    imageKey: robot?.imageKey ?? "scout",
    priceCoins: String(robot?.priceCoins ?? 1000),
    coinsPerHour: String(robot?.coinsPerHour ?? 20),
    maxPerUser: String(robot?.maxPerUser ?? 3),
    levelRequired: String(robot?.levelRequired ?? 1),
    status: robot?.status ?? "draft",
    sortOrder: String(robot?.sortOrder ?? 100),
  };
}

/**
 * Creates or edits a robot. The database rejects a robot that would earn
 * more per hour than a pricier one, and owned robots keep their bought rate.
 */
export function RobotForm({ robot }: { robot?: AdminRobot }) {
  const initial: FormState = { status: "idle", values: initialValues(robot) };
  const [state, action] = useActionState(saveRobot, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const prefix = robot?.id ?? "new-robot";
  const formKey = !robot && state.status === "success" ? state.message : "form";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={robot?.id ?? ""} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-name`} label="Name" name="name" defaultValue={v.name} required maxLength={40} error={e.name} />
        <Field
          id={`${prefix}-slug`}
          label="Slug"
          name="slug"
          defaultValue={v.slug}
          required
          maxLength={48}
          hint="Lowercase, numbers and hyphens."
          error={e.slug}
        />
      </div>
      <Field
        id={`${prefix}-description`}
        label="Description"
        name="description"
        defaultValue={v.description}
        maxLength={200}
        error={e.description}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SelectField id={`${prefix}-tier`} label="Tier" name="tier" options={TIERS} defaultValue={v.tier} error={e.tier} />
        <SelectField id={`${prefix}-image`} label="Illustration" name="imageKey" options={IMAGES} defaultValue={v.imageKey} error={e.imageKey} />
        <SelectField id={`${prefix}-status`} label="Status" name="status" options={STATUSES} defaultValue={v.status} error={e.status} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Field id={`${prefix}-price`} label="Price (VC)" name="priceCoins" type="number" min={1} defaultValue={v.priceCoins} error={e.priceCoins} />
        <Field id={`${prefix}-rate`} label="VC per hour" name="coinsPerHour" type="number" min={1} defaultValue={v.coinsPerHour} error={e.coinsPerHour} />
        <Field id={`${prefix}-max`} label="Max per player" name="maxPerUser" type="number" min={1} defaultValue={v.maxPerUser} error={e.maxPerUser} />
        <Field id={`${prefix}-level`} label="Level required" name="levelRequired" type="number" min={1} defaultValue={v.levelRequired} error={e.levelRequired} />
        <Field id={`${prefix}-sort`} label="Sort order" name="sortOrder" type="number" defaultValue={v.sortOrder} error={e.sortOrder} />
      </div>
      <SubmitButton pendingLabel="Saving…">{robot ? "Save robot" : "Create robot"}</SubmitButton>
    </form>
  );
}

/** Global robot limits: how many a player may own and run, and how long storage lasts. */
export function RobotPolicyForm({ policy }: { policy: RobotPolicy }) {
  const initial: FormState = {
    status: "idle",
    values: {
      maxOwned: String(policy.maxOwned),
      maxActive: String(policy.maxActive),
      accrualCapHours: String(policy.accrualCapHours),
    },
  };
  const [state, action] = useActionState(updateRobotPolicy, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Max robots owned" name="maxOwned" type="number" min={1} max={500} defaultValue={v.maxOwned} error={e.maxOwned} />
        <Field label="Max working at once" name="maxActive" type="number" min={1} max={100} defaultValue={v.maxActive} error={e.maxActive} />
        <Field
          label="Storage (hours)"
          name="accrualCapHours"
          type="number"
          min={1}
          max={168}
          defaultValue={v.accrualCapHours}
          hint="Robots stop earning when storage is full until the player collects."
          error={e.accrualCapHours}
        />
      </div>
      <SubmitButton pendingLabel="Saving…">Save robot limits</SubmitButton>
    </form>
  );
}
