"use client";

import { useActionState } from "react";
import { signUp } from "@/app/(auth)/actions";
import { Field } from "@/components/ui/field";
import { DISCLOSURE_TEXT } from "@/components/layout/disclosure";
import { INITIAL_FORM_STATE } from "@/lib/auth/form-state";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function RegisterForm() {
  const [state, action] = useActionState(signUp, INITIAL_FORM_STATE);

  if (state.status === "success") return <FormMessage state={state} />;

  const ackError = state.fieldErrors?.acknowledgeVirtual;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        required
        minLength={3}
        maxLength={24}
        hint="3-24 letters, numbers or underscores."
        defaultValue={state.values?.username}
        error={state.fieldErrors?.username}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint="At least 8 characters, including a letter and a number."
        error={state.fieldErrors?.password}
      />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="acknowledgeVirtual"
            required
            aria-invalid={ackError ? true : undefined}
            aria-describedby={ackError ? "acknowledgeVirtual-error" : undefined}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span className="text-muted">{DISCLOSURE_TEXT} I understand.</span>
        </label>
        {ackError ? (
          <p id="acknowledgeVirtual-error" className="text-xs text-danger-text">
            {ackError}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}
