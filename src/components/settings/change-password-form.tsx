"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/(app)/settings/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Field } from "@/components/ui/field";
import { INITIAL_FORM_STATE } from "@/lib/auth/form-state";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, INITIAL_FORM_STATE);

  return (
    // Re-mount after success so the password fields are cleared.
    <form key={state.status === "success" ? state.message : "form"} action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint="At least 8 characters, including a letter and a number."
        error={state.fieldErrors?.password}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
    </form>
  );
}
