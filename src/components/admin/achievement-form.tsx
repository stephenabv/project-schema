"use client";

import { useActionState } from "react";
import { saveAchievement } from "@/app/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import type { FormState } from "@/lib/auth/form-state";
import { BADGE_ICON_KEYS } from "@/lib/progression/badge-icons";
import type { AdminAchievement } from "@/lib/validation/admin";

const METRICS = [
  { value: "total_taps", label: "Total taps" },
  { value: "total_coins_earned", label: "Virtual coins earned" },
  { value: "missions_completed", label: "Missions claimed" },
  { value: "level", label: "Level reached" },
  { value: "longest_streak", label: "Longest daily streak" },
] as const;
const ICONS = BADGE_ICON_KEYS.map((key) => ({ value: key, label: key }));

function initialValues(a?: AdminAchievement): Record<string, string> {
  return {
    id: a?.id ?? "",
    slug: a?.slug ?? "",
    title: a?.title ?? "",
    description: a?.description ?? "",
    metric: a?.metric ?? "total_taps",
    threshold: String(a?.threshold ?? 100),
    rewardCoins: String(a?.rewardCoins ?? 50),
    xpReward: String(a?.xpReward ?? 10),
    icon: a?.icon ?? "award",
    sortOrder: String(a?.sortOrder ?? 100),
    isActive: a?.isActive === false ? "" : "on",
  };
}

/**
 * Create or edit a badge. Lowering a threshold takes effect at each player's
 * next reward; the metric is locked once anyone has unlocked the badge.
 */
export function AchievementForm({ achievement }: { achievement?: AdminAchievement }) {
  const initial: FormState = { status: "idle", values: initialValues(achievement) };
  const [state, action] = useActionState(saveAchievement, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};
  const prefix = achievement?.id ?? "new-badge";
  const formKey = !achievement && state.status === "success" ? state.message : "form";

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={achievement?.id ?? ""} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-title`} label="Title" name="title" defaultValue={v.title} required maxLength={80} error={e.title} />
        <Field id={`${prefix}-slug`} label="Slug" name="slug" defaultValue={v.slug} required maxLength={48} error={e.slug} />
      </div>
      <Field id={`${prefix}-description`} label="Description" name="description" defaultValue={v.description} maxLength={280} error={e.description} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SelectField id={`${prefix}-metric`} label="Metric" name="metric" options={METRICS} defaultValue={v.metric} error={e.metric} />
        <Field id={`${prefix}-threshold`} label="Threshold" name="threshold" type="number" min={1} defaultValue={v.threshold} error={e.threshold} />
        <SelectField id={`${prefix}-icon`} label="Icon" name="icon" options={ICONS} defaultValue={v.icon} error={e.icon} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id={`${prefix}-reward`} label="Reward (VC)" name="rewardCoins" type="number" min={0} defaultValue={v.rewardCoins} error={e.rewardCoins} />
        <Field id={`${prefix}-xp`} label="XP" name="xpReward" type="number" min={0} defaultValue={v.xpReward} error={e.xpReward} />
        <Field id={`${prefix}-sort`} label="Sort order" name="sortOrder" type="number" defaultValue={v.sortOrder} error={e.sortOrder} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={v.isActive === "on"} className="size-4 accent-[var(--primary)]" />
        Active (visible and unlockable)
      </label>
      <SubmitButton pendingLabel="Saving…">{achievement ? "Save badge" : "Create badge"}</SubmitButton>
    </form>
  );
}
