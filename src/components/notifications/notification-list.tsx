"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { markAllNotificationsRead } from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import type { AppNotification } from "@/lib/validation/engagement";
import { NOTIFICATION_KIND_ICONS } from "./notification-meta";

/**
 * The inbox. Each row opens its own message page. "Mark all as read" updates
 * the list at once (optimistically) while the server catches up; if the
 * request fails, the refreshed server data puts the unread state back.
 */
export function NotificationList({ items, unread }: { items: AppNotification[]; unread: number }) {
  const [allRead, setAllRead] = useOptimistic(unread === 0);

  async function markAll() {
    setAllRead(true);
    await markAllNotificationsRead();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">
          {allRead ? "All caught up" : `${unread} unread`}
        </p>
        {allRead ? null : (
          <form action={markAll}>
            <Button type="submit" variant="secondary">
              Mark all as read
            </Button>
          </form>
        )}
      </div>
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = NOTIFICATION_KIND_ICONS[item.kind];
            const read = allRead || item.read;
            return (
              <li key={item.id}>
                <Link href={`/notifications/${item.id}`} prefetch={false} className="flex gap-3 px-5 py-3 hover:bg-background">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${read ? "" : "font-semibold"}`}>
                      {read ? null : <span className="sr-only">Unread: </span>}
                      {item.title}
                    </p>
                    {item.body ? <p className="line-clamp-2 text-sm text-muted">{item.body}</p> : null}
                    <p className="mt-1 text-xs text-muted">{formatDateTimeUtc(item.createdAt)}</p>
                  </div>
                  {read ? null : <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
