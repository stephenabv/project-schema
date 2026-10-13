import { ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { getAccountStatus } from "@/lib/auth/account-status";

/** Header link to the admin console, shown to admins only. */
export async function AdminLink() {
  const status = await getAccountStatus();
  if (!status?.isAdmin) return null;
  return (
    <ButtonLink href="/admin" variant="ghost" aria-label="Admin console" className="px-2.5">
      <ShieldCheck aria-hidden className="size-4" />
      <span className="hidden lg:inline">Admin</span>
    </ButtonLink>
  );
}

/** Explains why rewards are blocked when an admin has suspended the account. */
export async function SuspensionNotice() {
  const status = await getAccountStatus();
  if (!status?.suspended) return null;
  return (
    <div className="mb-4">
      <Alert tone="danger">
        Your account is suspended, so taps and missions cannot earn virtual coins right now.
        {status.suspensionReason ? ` Reason: ${status.suspensionReason}` : ""}
      </Alert>
    </div>
  );
}
