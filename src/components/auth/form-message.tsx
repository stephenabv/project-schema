import { Alert } from "@/components/ui/alert";
import type { FormState } from "@/lib/auth/form-state";

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert>;
}
