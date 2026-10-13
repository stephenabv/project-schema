"use client";

import { useActionState } from "react";
import { saveTask } from "@/app/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import type { FormState } from "@/lib/auth/form-state";
import type { AdminTask } from "@/lib/validation/admin";

const OBJECTIVES = [
  { value: "taps", label: "Accepted taps" },
  { value: "missions", label: "Missions claimed" },
] as const;
const FREQUENCIES = [
  { value: "daily", label: "Daily (UTC day)" },
  { value: "weekly", label: "Weekly (ISO week)" },
  { value: "once", label: "One-time" },
] as const;
const STATUSES = [
  { value: "draft", label: "Draft (hidden)" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived (hidden)" },
] as const;

function initialValues(task?: AdminTask): Record<string, string> {
  return {
    id: task?.id ?? "",
    slug: task?.slug ?? "",
    title: task?.title ?? "",
    description: task?.description ?? "",
    objectiveType: task?.objectiveType ?? "taps",
    target: String(task?.target ?? 10),
    rewardCoins: String(task?.rewardCoins ?? 50),
    xpReward: String(task?.xpReward ?? 10),
    frequency: task?.frequency ?? "daily",
    status: task?.status ?? "draft",
    sortOrder: String(task?.sortOrder ?? 100),
  };
}

/** Create or edit a mission. The database locks objective and frequency once claims exist. */
export function TaskForm({ task }: { task?: AdminTask }) {
  const initial: FormState = { status: "idle", values: initialValues(task) };
  const [state, action] = useActionState(saveTask, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const prefix = task?.id ?? "new";
  // A successful create resets the form; edits keep the saved values.
  const formKey = !task && state.status === "success" ? state.message : "form";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={task?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-title`} label="Title" name="title" defaultValue={v.title} required maxLength={80} error={e.title} />
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
        maxLength={280}
        error={e.description}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField id={`${prefix}-objective`} label="Objective" name="objectiveType" options={OBJECTIVES} defaultValue={v.objectiveType} error={e.objectiveType} />
        <Field id={`${prefix}-target`} label="Target" name="target" type="number" min={1} defaultValue={v.target} error={e.target} />
        <SelectField id={`${prefix}-frequency`} label="Frequency" name="frequency" options={FREQUENCIES} defaultValue={v.frequency} error={e.frequency} />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id={`${prefix}-reward`} label="Reward (VC)" name="rewardCoins" type="number" min={1} defaultValue={v.rewardCoins} error={e.rewardCoins} />
        <Field id={`${prefix}-xp`} label="XP" name="xpReward" type="number" min={0} defaultValue={v.xpReward} error={e.xpReward} />
        <Field id={`${prefix}-sort`} label="Sort order" name="sortOrder" type="number" defaultValue={v.sortOrder} error={e.sortOrder} />
        <SelectField id={`${prefix}-status`} label="Status" name="status" options={STATUSES} defaultValue={v.status} error={e.status} />
      </div>
      <SubmitButton pendingLabel="Saving…">{task ? "Save mission" : "Create mission"}</SubmitButton>
    </form>
  );
}
