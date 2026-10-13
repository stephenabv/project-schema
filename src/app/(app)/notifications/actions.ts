"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { NotificationService } from "@/services/notifications";

/** Marks every notification read for the signed-in player. */
export async function markAllNotificationsRead(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  try {
    await new NotificationService(supabase).markRead();
  } catch (error) {
    logger.warn("mark_notifications_read_failed", { code: error instanceof AppError ? error.code : "unknown" });
  }
  refresh();
}
