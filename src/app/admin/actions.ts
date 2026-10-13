"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import type { FormState } from "@/lib/auth/form-state";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  achievementInputSchema,
  adjustmentInputSchema,
  tapPolicyInputSchema,
  taskInputSchema,
  userActionSchema,
} from "@/lib/validation/admin";
import { fieldErrorsOf } from "@/lib/validation/auth";
import { FEATURE_FLAGS, maintenanceInputSchema, scheduleInputSchema } from "@/lib/validation/operations";
import { formatSignedCoins } from "@/lib/formatting/coins";
import { parseRecordId } from "@/lib/http/admin";
import { AdminService } from "@/services/admin";

// Server Actions are public endpoints: each one re-checks the admin role, and
// the database functions check it again and write the audit log.

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function values(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, text(formData, key)]));
}

/** Runs an admin operation and turns failures into a form message. */
async function run(
  operation: string,
  echo: Record<string, string>,
  fn: (admin: AdminService) => Promise<string>,
): Promise<FormState> {
  try {
    const { supabase } = await requireAdmin();
    const message = await fn(new AdminService(supabase));
    refresh();
    return { status: "success", message, values: echo };
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      return { status: "error", message: error.message, values: echo };
    }
    logger.error("admin_action_failed", { operation, code: error instanceof AppError ? error.code : "unknown" });
    return { status: "error", message: "Something went wrong. Please try again.", values: echo };
  }
}

function invalid<T>(result: z.ZodSafeParseResult<T>, echo: Record<string, string>): FormState | null {
  return result.success ? null : { status: "error", fieldErrors: fieldErrorsOf(result.error), values: echo };
}

const TASK_FIELDS = [
  "id", "slug", "title", "description", "objectiveType", "target", "rewardCoins", "xpReward", "frequency", "status", "sortOrder",
] as const;

export async function saveTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, TASK_FIELDS);
  const { id, ...fields } = echo;
  const parsed = taskInputSchema.safeParse(fields);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("save_task", echo, async (admin) => {
    const task = await admin.saveTask(id ? parseRecordId(id) : null, parsed.data);
    return id ? `Saved ${task.title}.` : `Created ${task.title}.`;
  });
}

const ACHIEVEMENT_FIELDS = [
  "id", "slug", "title", "description", "metric", "threshold", "rewardCoins", "xpReward", "icon", "sortOrder", "isActive",
] as const;

export async function saveAchievement(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ACHIEVEMENT_FIELDS);
  const { id, isActive, ...fields } = echo;
  const parsed = achievementInputSchema.safeParse({ ...fields, isActive: isActive === "on" });
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("save_achievement", echo, async (admin) => {
    const achievement = await admin.saveAchievement(id ? parseRecordId(id) : null, parsed.data);
    return id ? `Saved ${achievement.title}.` : `Created ${achievement.title}.`;
  });
}

export async function updateTapPolicy(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["rewardCoins", "cooldownMs", "dailyLimit", "xpPerTap"]);
  const parsed = tapPolicyInputSchema.safeParse(echo);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("update_tap_policy", echo, async (admin) => {
    await admin.updateTapPolicy(parsed.data);
    return "Tap policy saved. New taps use it immediately.";
  });
}

export async function applyUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["userId", "action", "reason", "role"]);
  const { userId, action, reason, role } = echo;
  const parsed = userActionSchema.safeParse(
    action === "suspend" ? { action, reason } : action === "set_role" ? { action, role } : { action },
  );
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("user_action", echo, async (admin) => {
    await admin.applyUserAction(parseRecordId(userId), parsed.data);
    switch (parsed.data.action) {
      case "suspend":
        return "Account suspended.";
      case "restore":
        return "Account restored.";
      case "set_role":
        return parsed.data.role === "admin" ? "Admin role granted." : "Admin role removed.";
    }
  });
}

export async function adjustBalance(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["userId", "amountCoins", "reason", "idempotencyKey"]);
  const { userId, ...fields } = echo;
  const parsed = adjustmentInputSchema.safeParse(fields);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("adjust_balance", echo, async (admin) => {
    const result = await admin.adjustBalance(parseRecordId(userId), parsed.data);
    return result.duplicate
      ? "This adjustment was already applied."
      : `Applied ${formatSignedCoins(result.amountCoins)}. New virtual balance: ${result.balanceCoins} VC.`;
  });
}

export async function updateFeatureFlags(_prev: FormState, formData: FormData): Promise<FormState> {
  const flags = Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag, formData.get(flag) === "on"])) as Record<
    (typeof FEATURE_FLAGS)[number],
    boolean
  >;
  const echo = Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag, flags[flag] ? "on" : ""]));

  return run("update_feature_flags", echo, async (admin) => {
    await admin.updateFeatureFlags(flags);
    return "Feature flags saved. Changes apply immediately.";
  });
}

export async function setMaintenance(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["enabled", "message"]);
  const parsed = maintenanceInputSchema.safeParse({ enabled: echo.enabled === "true", message: echo.message });
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("set_maintenance", echo, async (admin) => {
    const status = await admin.setMaintenance(parsed.data);
    return status.enabled
      ? "Maintenance mode is on: earning and spending are paused."
      : "Maintenance mode is off: earning and spending are back.";
  });
}

export async function scheduleTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const echo = values(formData, ["taskId", "publishAt", "unpublishAt"]);
  const { taskId, ...fields } = echo;
  const parsed = scheduleInputSchema.safeParse(fields);
  const failure = invalid(parsed, echo);
  if (failure || !parsed.success) return failure!;

  return run("schedule_task", echo, async (admin) => {
    const task = await admin.scheduleTask(parseRecordId(taskId), parsed.data);
    return task.live ? `${task.title} is live now.` : `Schedule saved for ${task.title}.`;
  });
}
