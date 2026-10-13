import { Bell, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { getAccountStatus } from "@/lib/auth/account-status";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { NotificationService } from "@/services/notifications";

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

/** Header bell with the unread notification count. A failed count never breaks the page. */
export async function NotificationBell() {
  const { supabase, user } = await requireUser();
  if (!user) return null;

  let unread = 0;
  try {
    unread = await new NotificationService(supabase).unreadCount();
  } catch (error) {
    logger.warn("notification_count_failed", { code: error instanceof AppError ? error.code : "unknown" });
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <ButtonLink href="/notifications" variant="ghost" aria-label={label} className="relative px-2.5">
      <Bell aria-hidden className="size-4" />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger-text px-1 text-center text-[10px] font-bold leading-4 text-white tabular-nums"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </ButtonLink>
  );
}
