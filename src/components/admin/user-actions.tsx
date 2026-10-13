"use client";

import { useActionState } from "react";
import { adjustBalance, applyUserAction } from "@/app/admin/actions";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { INITIAL_FORM_STATE } from "@/lib/auth/form-state";
import type { AdminUser } from "@/lib/validation/admin";

/** Suspend/restore, role and balance controls for one user row. */
export function UserActions({
  user,
  isSelf,
  adjustmentKey,
}: {
  user: AdminUser;
  isSelf: boolean;
  /** Issued per server render; a double submit replays the same adjustment. */
  adjustmentKey: string;
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-semibold text-primary group-open:mb-3">Manage</summary>
      <div className="flex w-72 flex-col gap-4 rounded-xl border border-border bg-background p-3">
        {isSelf ? (
          <p className="text-xs text-muted">This is your account. Ask another admin to change your role or status.</p>
        ) : (
          <>
            <SuspensionForm user={user} />
            <RoleForm user={user} />
          </>
        )}
        <AdjustmentForm user={user} adjustmentKey={adjustmentKey} />
      </div>
    </details>
  );
}

function SuspensionForm({ user }: { user: AdminUser }) {
  const [state, action, pending] = useActionState(applyUserAction, INITIAL_FORM_STATE);
  const suspended = Boolean(user.suspendedAt);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="action" value={suspended ? "restore" : "suspend"} />
      <FormMessage state={state} />
      {suspended ? null : (
        <Field
          id={`reason-${user.id}`}
          label="Suspension reason"
          name="reason"
          maxLength={280}
          required
          disabled={user.role === "admin"}
          error={state.fieldErrors?.reason}
        />
      )}
      <Button type="submit" variant="secondary" disabled={pending || (!suspended && user.role === "admin")}>
        {suspended ? "Restore account" : "Suspend account"}
      </Button>
      {!suspended && user.role === "admin" ? <p className="text-xs text-muted">Remove the admin role first.</p> : null}
    </form>
  );
}

function RoleForm({ user }: { user: AdminUser }) {
  const [state, action, pending] = useActionState(applyUserAction, INITIAL_FORM_STATE);
  const next = user.role === "admin" ? "user" : "admin";

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="action" value="set_role" />
      <input type="hidden" name="role" value={next} />
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {next === "admin" ? "Make admin" : "Remove admin role"}
      </Button>
    </form>
  );
}

function AdjustmentForm({ user, adjustmentKey }: { user: AdminUser; adjustmentKey: string }) {
  const [state, action, pending] = useActionState(adjustBalance, INITIAL_FORM_STATE);

  return (
    <form key={state.status === "success" ? state.message : "adjust"} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="idempotencyKey" value={adjustmentKey} />
      <FormMessage state={state} />
      <Field
        id={`amount-${user.id}`}
        label="Adjust virtual coins"
        name="amountCoins"
        type="number"
        hint="Use a negative number to deduct."
        error={state.fieldErrors?.amountCoins}
      />
      <Field id={`adjust-reason-${user.id}`} label="Reason" name="reason" maxLength={280} error={state.fieldErrors?.reason} />
      <Button type="submit" variant="secondary" disabled={pending}>
        Apply adjustment
      </Button>
    </form>
  );
}
