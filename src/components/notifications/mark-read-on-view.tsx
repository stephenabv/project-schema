"use client";

import { useEffect } from "react";
import { markNotificationRead } from "@/app/(app)/notifications/actions";

/**
 * Marks the open message read once it is actually shown. Done from the
 * browser rather than during render so link prefetches never mark anything.
 */
export function MarkReadOnView({ id }: { id: string }) {
  useEffect(() => {
    void markNotificationRead(id);
  }, [id]);
  return null;
}
