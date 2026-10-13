import { Award, Bell, CalendarCheck, ShieldAlert, ShoppingBag, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { markAllNotificationsRead } from "@/app/(app)/notifications/actions";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import type { AppNotification } from "@/lib/validation/engagement";
import { NotificationService } from "@/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

const KIND_ICONS: Record<AppNotification["kind"], LucideIcon> = {
  badge: Award,
  level: TrendingUp,
  bonus: CalendarCheck,
  shop: ShoppingBag,
  account: ShieldAlert,
  wallet: Wallet,
};

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" description="Badges, level-ups, purchases and account updates." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NotificationsContent />
      </Suspense>
    </>
  );
}

async function NotificationsContent() {
  const { supabase } = await getSessionOrRedirect("/notifications");
  const { items, unread } = await new NotificationService(supabase).list();

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
        <Bell aria-hidden className="size-6" />
        Nothing yet. Badges, level-ups and purchases will show up here.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{unread > 0 ? `${unread} unread` : "All caught up"}</p>
        {unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="secondary">
              Mark all as read
            </Button>
          </form>
        ) : null}
      </div>
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = KIND_ICONS[item.kind];
            const content = (
              <>
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${item.read ? "" : "font-semibold"}`}>
                    {item.read ? null : <span className="sr-only">Unread: </span>}
                    {item.title}
                  </p>
                  {item.body ? <p className="text-sm text-muted">{item.body}</p> : null}
                  <p className="mt-1 text-xs text-muted">{formatDateTimeUtc(item.createdAt)}</p>
                </div>
                {item.read ? null : <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </>
            );
            return (
              <li key={item.id}>
                {item.link ? (
                  <Link href={item.link} className="flex gap-3 px-5 py-3 hover:bg-background">
                    {content}
                  </Link>
                ) : (
                  <div className="flex gap-3 px-5 py-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
