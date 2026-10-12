"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { Field } from "@/components/ui/field";
import { INITIAL_FORM_STATE } from "@/lib/auth/form-state";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, INITIAL_FORM_STATE);

  if (state.status === "success") return <FormMessage state={state} />;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
