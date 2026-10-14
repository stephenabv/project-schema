import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { NotificationService } from "@/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

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

  return <NotificationList items={items} unread={unread} />;
}
