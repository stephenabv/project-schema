import type { FieldErrors } from "@/lib/validation/auth";

export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echoed non-secret values so the form keeps them after a failed submit. */
  values?: Record<string, string>;
}

export const INITIAL_FORM_STATE: FormState = { status: "idle" };
