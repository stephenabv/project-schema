"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(app)/profile/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/form-state";
import { AVATAR_KEYS, type AvatarKey } from "@/lib/validation/profile";
import { AVATAR_ICONS } from "./avatar";

export function ProfileForm({ username, avatarKey }: { username: string; avatarKey: AvatarKey }) {
  const initial: FormState = { status: "idle", values: { username, avatarKey } };
  const [state, action] = useActionState(updateProfile, initial);
  const current = state.values ?? initial.values!;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Username"
        name="username"
        defaultValue={current.username}
        key={`username-${current.username}`}
        autoComplete="username"
        required
        minLength={3}
        maxLength={24}
        pattern="[A-Za-z0-9_]{3,24}"
        hint="3-24 letters, numbers or underscores. Shown to other players."
        error={state.fieldErrors?.username}
      />
      <fieldset className="flex flex-col gap-2" aria-describedby={state.fieldErrors?.avatarKey ? "avatar-error" : undefined}>
        <legend className="mb-1.5 text-sm font-medium">Avatar</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" key={`avatar-${current.avatarKey}`}>
          {AVATAR_KEYS.map((key) => {
            const Icon = AVATAR_ICONS[key];
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-surface p-3 text-muted has-[:checked]:border-primary has-[:checked]:bg-success-surface has-[:checked]:text-success-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
              >
                <input
                  type="radio"
                  name="avatarKey"
                  value={key}
                  defaultChecked={current.avatarKey === key}
                  className="sr-only"
                />
                <Icon aria-hidden className="size-6" />
                <span className="sr-only">{key}</span>
              </label>
            );
          })}
        </div>
        {state.fieldErrors?.avatarKey ? (
          <p id="avatar-error" className="text-xs text-danger-text">
            {state.fieldErrors.avatarKey}
          </p>
        ) : null}
      </fieldset>
      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
