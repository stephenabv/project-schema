import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserActions } from "@/components/admin/user-actions";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOrNotFound } from "@/lib/auth/require-admin";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import { formatShortDate, formatShortDay } from "@/lib/formatting/dates";
import { userQuerySchema } from "@/lib/validation/admin";
import { queryRecord } from "@/lib/validation/transactions";
import { ADMIN_USERS_PAGE_SIZE, AdminService } from "@/services/admin";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <PageHeader title="Users" description="Search players, suspend or restore accounts, manage admins and adjust virtual balances." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UsersContent({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const { supabase, user: me } = await getAdminOrNotFound("/admin/users");
  const { q, page } = userQuerySchema.parse(queryRecord(await searchParams));
  const result = await new AdminService(supabase).listUsers(q || undefined, page);
  const pages = Math.max(1, Math.ceil(result.total / ADMIN_USERS_PAGE_SIZE));
  const pageHref = (n: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;

  return (
    <div className="flex flex-col gap-4">
      <form method="get" action="/admin/users" className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted">
          Username, email or user id
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={254}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Search
        </button>
      </form>

      <p className="text-sm text-muted">
        {formatCount(result.total)} {result.total === 1 ? "player" : "players"}
        {q ? ` matching “${q}”` : ""}
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">Players, newest first</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Player", "Status", "Balance", "Level", "Taps", "Joined", "Last active", ""].map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {result.items.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{user.username}</p>
                  <p className="text-xs text-muted">{user.email ?? "no email"}</p>
                  <p className="font-mono text-[11px] text-muted" title={user.id}>
                    {user.id.slice(0, 8)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {user.role === "admin" ? (
                    <span className="mr-1 rounded-full bg-warning-surface px-2 py-0.5 text-xs font-semibold text-warning-text">admin</span>
                  ) : null}
                  {user.suspendedAt ? (
                    <span
                      className="rounded-full bg-danger-surface px-2 py-0.5 text-xs font-semibold text-danger-text"
                      title={user.suspensionReason ?? undefined}
                    >
                      suspended
                    </span>
                  ) : (
                    <span className="text-xs text-muted">active</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatCoins(user.balanceCoins)}</td>
                <td className="px-4 py-3 tabular-nums">{user.level}</td>
                <td className="px-4 py-3 tabular-nums">{formatCount(user.totalTaps)}</td>
                <td className="px-4 py-3 text-muted">{formatShortDate(user.createdAt)}</td>
                <td className="px-4 py-3 text-muted">{user.lastActiveOn ? formatShortDay(user.lastActiveOn) : "never"}</td>
                <td className="px-4 py-3">
                  <UserActions user={user} isSelf={user.id === me.id} adjustmentKey={randomUUID()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.items.length === 0 ? <p className="p-8 text-center text-sm text-muted">No players found.</p> : null}
      </Card>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClass("secondary")}>Previous</Link> : <span />}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)} className={buttonClass("secondary")}>Next</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
