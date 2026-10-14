import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { MarkReadOnView } from "@/components/notifications/mark-read-on-view";
import { NOTIFICATION_KIND_ICONS, notificationLinkLabel } from "@/components/notifications/notification-meta";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionOrRedirect } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { formatDateTimeUtc } from "@/lib/formatting/dates";
import { NotificationService } from "@/services/notifications";

export const metadata: Metadata = { title: "Notification" };

const idSchema = z.uuid();

export default function NotificationPage({ params }: PageProps<"/notifications/[id]">) {
  return (
    <>
      <ButtonLink href="/notifications" variant="ghost" className="-ml-3 mb-4 self-start">
        <ArrowLeft aria-hidden className="size-4" />
        All notifications
      </ButtonLink>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <NotificationContent params={params} />
      </Suspense>
    </>
  );
}

async function NotificationContent({ params }: Pick<PageProps<"/notifications/[id]">, "params">) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const { supabase } = await getSessionOrRedirect(`/notifications/${parsedId.data}`);

  let notification;
  try {
    notification = await new NotificationService(supabase).get(parsedId.data);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const Icon = NOTIFICATION_KIND_ICONS[notification.kind];
  return (
    <Card className="flex flex-col gap-4">
      {notification.read ? null : <MarkReadOnView id={notification.id} />}
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background">
          <Icon aria-hidden className="size-4 text-muted" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">{notification.title}</h1>
          <p className="text-xs text-muted">{formatDateTimeUtc(notification.createdAt)}</p>
        </div>
      </div>
      {notification.body ? <p className="whitespace-pre-line break-words text-sm">{notification.body}</p> : null}
      {notification.link ? (
        <ButtonLink href={notification.link} variant="secondary" className="self-start">
          {notificationLinkLabel(notification.link)}
        </ButtonLink>
      ) : null}
    </Card>
  );
}
