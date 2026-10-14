import "server-only";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  notificationListSchema,
  notificationSchema,
  type AppNotification,
  type NotificationList,
} from "@/lib/validation/engagement";
import { parseContract } from "./contract";

export const NOTIFICATION_PAGE_SIZE = 30;

/** The caller's in-app notifications (written by database triggers). */
export class NotificationService {
  constructor(private readonly db: AppSupabaseClient) {}

  async list(limit: number = NOTIFICATION_PAGE_SIZE): Promise<NotificationList> {
    const { data, error } = await this.db.rpc("ve_list_notifications", { p_limit: limit });
    if (error) throw toAppError(error, "ve_list_notifications");
    return parseContract(notificationListSchema, data, "ve_list_notifications");
  }

  /** One of the caller's notifications. Row-level security hides other players' rows, so they read as not found. */
  async get(id: string): Promise<AppNotification> {
    const { data, error } = await this.db
      .from("ve_notifications")
      .select("id, kind, title, body, link, created_at, read_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw toAppError(error, "get_notification");
    if (!data) throw new NotFoundError("Notification not found");
    return parseContract(
      notificationSchema,
      {
        id: data.id,
        kind: data.kind,
        title: data.title,
        body: data.body,
        link: data.link,
        createdAt: data.created_at,
        read: data.read_at !== null,
      },
      "get_notification",
    );
  }

  async unreadCount(): Promise<number> {
    const { data, error } = await this.db.rpc("ve_unread_notification_count");
    if (error) throw toAppError(error, "ve_unread_notification_count");
    return parseContract(z.number().int().nonnegative(), data, "ve_unread_notification_count");
  }

  /** Marks the given notifications read, or all of them when `ids` is omitted. Returns how many changed. */
  async markRead(ids?: readonly string[]): Promise<number> {
    const { data, error } = await this.db.rpc("ve_mark_notifications_read", { p_ids: ids ? [...ids] : null });
    if (error) throw toAppError(error, "ve_mark_notifications_read");
    return parseContract(z.number().int().nonnegative(), data, "ve_mark_notifications_read");
  }
}
