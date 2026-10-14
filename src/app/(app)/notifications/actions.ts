"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { NotificationService } from "@/services/notifications";

/** Marks every notification read for the signed-in player. */
export async function markAllNotificationsRead(): Promise<void> {
  await markRead(undefined);
}

/** Marks one of the signed-in player's notifications read (other players' ids change nothing). */
export async function markNotificationRead(id: unknown): Promise<void> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return;
  await markRead([parsed.data]);
}

async function markRead(ids: readonly string[] | undefined): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  try {
    await new NotificationService(supabase).markRead(ids);
  } catch (error) {
    logger.warn("mark_notifications_read_failed", { code: error instanceof AppError ? error.code : "unknown" });
  }
  // Re-render the header bell and inbox from the server, which also settles any optimistic update.
  refresh();
}
