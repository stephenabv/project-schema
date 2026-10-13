import { Info } from "lucide-react";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { STATUS_LABELS, type ConversionStatus, type PayoutStatus } from "@/lib/validation/redemption";

type Status = ConversionStatus | PayoutStatus;

const TONES: Record<Status, string> = {
  pending: "bg-warning-surface text-warning-text",
  under_review: "bg-warning-surface text-warning-text",
  approved: "bg-success-surface text-success-text",
  processing: "bg-success-surface text-success-text",
  completed: "bg-success-surface text-success-text",
  paid: "bg-success-surface text-success-text",
  rejected: "bg-danger-surface text-danger-text",
  failed: "bg-danger-surface text-danger-text",
  refunded: "bg-background text-muted",
  cancelled: "bg-background text-muted",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A request's audit trail, oldest first, as recorded by the server. */
export function RequestTimeline({ events }: { events: readonly { toStatus: string; note: string | null; createdAt: string }[] }) {
  return (
    <ol className="flex flex-col gap-1 border-l border-border pl-3 text-xs">
      {events.map((event, index) => (
        <li key={`${event.createdAt}-${index}`}>
          <span className="font-medium">{STATUS_LABELS[event.toStatus as Status] ?? event.toStatus}</span>
          <span className="text-muted"> · {formatDateTimeUtc(event.createdAt)}</span>
          {event.note ? <p className="text-muted">{event.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export const REDEMPTION_NOTICE =
  "Requests are reviewed by hand by the Virtual Earn team. A request is not a payment: nothing is paid until an admin has sent the money and confirmed it, and a request can be rejected. There is no automatic payment provider.";

/** Shown on every conversion and payout screen, next to the main VC disclosure. */
export function RedemptionNotice() {
  return (
    <aside aria-label="Request review notice" className="flex gap-3 rounded-xl border border-border bg-surface p-3 text-xs text-muted">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>{REDEMPTION_NOTICE}</p>
    </aside>
  );
}
