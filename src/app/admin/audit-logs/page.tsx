import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { auditQuerySchema } from "@/lib/validation/admin";
import { queryRecord } from "@/lib/validation/transactions";
import { AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Audit log" };

const ACTIONS = [
  { value: "", label: "All actions" },
  { value: "user.", label: "Users (all)" },
  { value: "user.suspend", label: "Suspensions" },
  { value: "user.restore", label: "Restorations" },
  { value: "user.role", label: "Role changes" },
  { value: "wallet.adjust", label: "Balance adjustments" },
  { value: "task.", label: "Missions" },
  { value: "achievement.", label: "Badges" },
  { value: "settings.", label: "Settings" },
] as const;

export default function AuditLogPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  return (
    <>
      <PageHeader title="Audit log" description="Every admin change, newest first. Entries cannot be edited or deleted." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AuditContent({ searchParams }: Pick<PageProps<"/admin/audit-logs">, "searchParams">) {
  const { supabase } = await getAdminOrNotFound("/admin/audit-logs");
  const query = auditQuerySchema.parse(queryRecord(await searchParams));
  const page = await new AdminService(supabase).listAuditLogs(query);
  const inputClass = "rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground";
  const filters = { action: query.action, target: query.target, from: query.from, to: query.to };
  const nextHref = page.nextCursor
    ? `/admin/audit-logs?${new URLSearchParams({
        ...Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))),
        cursor: page.nextCursor,
      })}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <form method="get" action="/admin/audit-logs" className="flex flex-wrap items-end gap-3" aria-label="Filter audit log">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Action
          <select name="action" defaultValue={query.action ?? ""} className={inputClass}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Target id
          <input name="target" defaultValue={query.target} maxLength={64} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          From (UTC)
          <input type="date" name="from" defaultValue={query.from} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          To (UTC)
          <input type="date" name="to" defaultValue={query.to} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
        <a href="/admin/audit-logs" className={buttonClass("ghost")}>
          Reset
        </a>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Admin audit trail, newest first</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              {["When", "Admin", "Action", "Target", "Details"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {page.items.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTimeUtc(entry.createdAt)}</td>
                <td className="px-4 py-3">{entry.actorUsername ?? (entry.actorId ? entry.actorId.slice(0, 8) : "system")}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted" title={entry.targetId ?? undefined}>
                  {entry.targetType}:{entry.targetId ? entry.targetId.slice(0, 12) : "—"}
                </td>
                <td className="px-4 py-3">
                  <code className="block max-w-md whitespace-pre-wrap break-words text-xs text-muted">
                    {JSON.stringify(entry.metadata)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {page.items.length === 0 ? <p className="p-8 text-center text-sm text-muted">No entries match these filters.</p> : null}
      </Card>

      {nextHref ? (
        <Link href={nextHref} className={`${buttonClass("secondary")} self-end`}>
          Older entries
        </Link>
      ) : null}
    </div>
  );
}
