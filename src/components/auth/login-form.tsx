"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { INITIAL_FORM_STATE } from "@/lib/auth/form-state";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

const QUERY_MESSAGES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please try again.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [state, action] = useActionState(signIn, INITIAL_FORM_STATE);
  const queryError = QUERY_MESSAGES[searchParams.get("error") ?? ""];

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {queryError && state.status === "idle" ? <Alert tone="danger">{queryError}</Alert> : null}
      <FormMessage state={state} />
      {/* Validated again on the server; only same-origin paths are honoured. */}
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
