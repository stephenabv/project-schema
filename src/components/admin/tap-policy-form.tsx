"use client";

import { useActionState } from "react";
import { updateTapPolicy } from "@/app/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/form-state";
import type { TapPolicy } from "@/types/api";

/**
 * Edits the live tap policy. Bounds are enforced again by the database. Taps
 * are a supplementary source; robots are meant to be the main one.
 */
export function TapPolicyForm({ policy }: { policy: TapPolicy }) {
  const initial: FormState = {
    status: "idle",
    values: {
      rewardCoins: String(policy.rewardCoins),
      cooldownMs: String(policy.cooldownMs),
      dailyLimit: String(policy.dailyLimit),
      xpPerTap: String(policy.xpPerTap),
      perMinuteLimit: String(policy.perMinuteLimit),
    },
  };
  const [state, action] = useActionState(updateTapPolicy, initial);
  const v = state.values ?? initial.values!;
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Reward per tap (VC)" name="rewardCoins" type="number" min={1} max={1000} defaultValue={v.rewardCoins} hint="1 to 1,000" error={e.rewardCoins} />
        <Field label="XP per tap" name="xpPerTap" type="number" min={0} max={100} defaultValue={v.xpPerTap} hint="0 to 100" error={e.xpPerTap} />
        <Field label="Cooldown (ms)" name="cooldownMs" type="number" min={250} max={60000} defaultValue={v.cooldownMs} hint="250 to 60,000" error={e.cooldownMs} />
        <Field label="Daily tap limit" name="dailyLimit" type="number" min={1} max={100000} defaultValue={v.dailyLimit} hint="1 to 100,000 per UTC day" error={e.dailyLimit} />
        <Field label="Taps per minute" name="perMinuteLimit" type="number" min={1} max={240} defaultValue={v.perMinuteLimit} hint="Burst limit against automated tapping, 1 to 240" error={e.perMinuteLimit} />
      </div>
      <SubmitButton pendingLabel="Saving…">Save tap policy</SubmitButton>
    </form>
  );
}
