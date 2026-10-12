"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/(auth)/actions";
import { Field } from "@/components/ui/field";
import { INITIAL_FORM_STATE } from "@/lib/auth/form-state";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, INITIAL_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
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
      <SubmitButton pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
