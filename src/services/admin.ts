import "server-only";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  activitySeriesSchema,
  adjustmentResultSchema,
  adminAchievementSchema,
  adminOverviewSchema,
  adminSettingsSchema,
  adminTaskSchema,
  adminUserPageSchema,
  auditPageResultSchema,
  roleResultSchema,
  suspensionResultSchema,
  suspiciousRowSchema,
  tapPolicySchema,
  type AchievementInput,
  type ActivityPoint,
  type AdjustmentInput,
  type AdjustmentResult,
  type AdminAchievement,
  type AdminOverview,
  type AdminSettings,
  type AdminTask,
  type AdminUserPage,
  type AuditPage,
  type AuditQuery,
  type SuspiciousRow,
  type TapPolicyInput,
  type TaskInput,
  type UserAction,
} from "@/lib/validation/admin";
import {
  economySeriesSchema,
  engagementSummarySchema,
  featureFlagsSchema,
  maintenanceSchema,
  retentionSchema,
  type EconomyPoint,
  type EngagementSummary,
  type FeatureFlags,
  type MaintenanceInput,
  type MaintenanceStatus,
  type RetentionCohort,
  type ScheduleInput,
} from "@/lib/validation/operations";
import type { TapPolicy } from "@/types/api";
import { parseContract } from "./contract";

export const ADMIN_USERS_PAGE_SIZE = 25;
export const AUDIT_PAGE_SIZE = 50;

/**
 * Admin console operations. Every call goes to a ve_admin_* database
 * function that re-checks the caller's admin role and writes the audit log,
 * so this class holds no authorization logic of its own.
 */
export class AdminService {
  constructor(private readonly db: AppSupabaseClient) {}

  async overview(): Promise<AdminOverview> {
    const { data, error } = await this.db.rpc("ve_admin_overview");
    if (error) throw toAppError(error, "ve_admin_overview");
    return parseContract(adminOverviewSchema, data, "ve_admin_overview");
  }

  async activitySeries(days: number): Promise<ActivityPoint[]> {
    const { data, error } = await this.db.rpc("ve_admin_activity_series", { p_days: days });
    if (error) throw toAppError(error, "ve_admin_activity_series");
    return parseContract(activitySeriesSchema, data, "ve_admin_activity_series");
  }

  async suspiciousActivity(days = 7): Promise<SuspiciousRow[]> {
    const { data, error } = await this.db.rpc("ve_admin_suspicious_activity", { p_days: days });
    if (error) throw toAppError(error, "ve_admin_suspicious_activity");
    return parseContract(z.array(suspiciousRowSchema), data, "ve_admin_suspicious_activity");
  }

  async listUsers(search: string | undefined, page: number, pageSize: number = ADMIN_USERS_PAGE_SIZE): Promise<AdminUserPage> {
    const { data, error } = await this.db.rpc("ve_admin_list_users", {
      p_search: search ?? null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw toAppError(error, "ve_admin_list_users");
    return parseContract(adminUserPageSchema, data, "ve_admin_list_users");
  }

  async applyUserAction(userId: string, action: UserAction): Promise<void> {
    if (action.action === "set_role") {
      const { data, error } = await this.db.rpc("ve_admin_set_role", { p_user_id: userId, p_role: action.role });
      if (error) throw toAppError(error, "ve_admin_set_role");
      parseContract(roleResultSchema, data, "ve_admin_set_role");
      return;
    }

    const { data, error } = await this.db.rpc("ve_admin_set_suspension", {
      p_user_id: userId,
      p_suspended: action.action === "suspend",
      p_reason: action.action === "suspend" ? action.reason : null,
    });
    if (error) throw toAppError(error, "ve_admin_set_suspension");
    parseContract(suspensionResultSchema, data, "ve_admin_set_suspension");
  }

  async adjustBalance(userId: string, input: AdjustmentInput): Promise<AdjustmentResult> {
    const { data, error } = await this.db.rpc("ve_admin_adjust_balance", {
      p_user_id: userId,
      p_amount: input.amountCoins,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw toAppError(error, "ve_admin_adjust_balance");
    return parseContract(adjustmentResultSchema, data, "ve_admin_adjust_balance");
  }

  async listTasks(): Promise<AdminTask[]> {
    const { data, error } = await this.db.rpc("ve_admin_list_tasks");
    if (error) throw toAppError(error, "ve_admin_list_tasks");
    return parseContract(z.array(adminTaskSchema), data, "ve_admin_list_tasks");
  }

  /** Creates a mission when `taskId` is null, otherwise updates it. */
  async saveTask(taskId: string | null, input: TaskInput): Promise<AdminTask> {
    const { data, error } = await this.db.rpc("ve_admin_save_task", { p_task_id: taskId, p_task: input });
    if (error) throw toAppError(error, "ve_admin_save_task");
    return parseContract(adminTaskSchema, data, "ve_admin_save_task");
  }

  async listAchievements(): Promise<AdminAchievement[]> {
    const { data, error } = await this.db.rpc("ve_admin_list_achievements");
    if (error) throw toAppError(error, "ve_admin_list_achievements");
    return parseContract(z.array(adminAchievementSchema), data, "ve_admin_list_achievements");
  }

  async saveAchievement(id: string | null, input: AchievementInput): Promise<AdminAchievement> {
    const { data, error } = await this.db.rpc("ve_admin_save_achievement", { p_id: id, p_achievement: input });
    if (error) throw toAppError(error, "ve_admin_save_achievement");
    return parseContract(adminAchievementSchema, data, "ve_admin_save_achievement");
  }

  async getSettings(): Promise<AdminSettings> {
    const { data, error } = await this.db.rpc("ve_admin_get_settings");
    if (error) throw toAppError(error, "ve_admin_get_settings");
    return parseContract(adminSettingsSchema, data, "ve_admin_get_settings");
  }

  async updateTapPolicy(policy: TapPolicyInput): Promise<TapPolicy> {
    const { data, error } = await this.db.rpc("ve_admin_update_tap_policy", { p_policy: policy });
    if (error) throw toAppError(error, "ve_admin_update_tap_policy");
    return parseContract(tapPolicySchema, data, "ve_admin_update_tap_policy");
  }

  async updateFeatureFlags(flags: FeatureFlags): Promise<FeatureFlags> {
    const { data, error } = await this.db.rpc("ve_admin_update_feature_flags", { p_flags: flags });
    if (error) throw toAppError(error, "ve_admin_update_feature_flags");
    return parseContract(featureFlagsSchema, data, "ve_admin_update_feature_flags");
  }

  async setMaintenance(input: MaintenanceInput): Promise<MaintenanceStatus> {
    const { data, error } = await this.db.rpc("ve_admin_set_maintenance", {
      p_enabled: input.enabled,
      p_message: input.message,
    });
    if (error) throw toAppError(error, "ve_admin_set_maintenance");
    return parseContract(maintenanceSchema, data, "ve_admin_set_maintenance");
  }

  /** Sets a mission's publishing window; nulls remove the limit. */
  async scheduleTask(taskId: string, input: ScheduleInput): Promise<AdminTask> {
    const { data, error } = await this.db.rpc("ve_admin_schedule_task", {
      p_task_id: taskId,
      p_publish_at: input.publishAt,
      p_unpublish_at: input.unpublishAt,
    });
    if (error) throw toAppError(error, "ve_admin_schedule_task");
    return parseContract(adminTaskSchema, data, "ve_admin_schedule_task");
  }

  async economySeries(days: number): Promise<EconomyPoint[]> {
    const { data, error } = await this.db.rpc("ve_admin_economy_series", { p_days: days });
    if (error) throw toAppError(error, "ve_admin_economy_series");
    return parseContract(economySeriesSchema, data, "ve_admin_economy_series");
  }

  async retention(weeks: number): Promise<RetentionCohort[]> {
    const { data, error } = await this.db.rpc("ve_admin_retention", { p_weeks: weeks });
    if (error) throw toAppError(error, "ve_admin_retention");
    return parseContract(retentionSchema, data, "ve_admin_retention");
  }

  async engagementSummary(): Promise<EngagementSummary> {
    const { data, error } = await this.db.rpc("ve_admin_engagement_summary");
    if (error) throw toAppError(error, "ve_admin_engagement_summary");
    return parseContract(engagementSummarySchema, data, "ve_admin_engagement_summary");
  }

  async listAuditLogs(query: AuditQuery, limit: number = AUDIT_PAGE_SIZE): Promise<AuditPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const { data, error } = await this.db.rpc("ve_admin_list_audit_logs", {
      p_action: query.action || null,
      p_target_id: query.target || null,
      p_from: query.from ? `${query.from}T00:00:00Z` : null,
      p_to: query.to ? nextDay(query.to) : null,
      p_before_created_at: cursor?.createdAt ?? null,
      p_before_id: cursor?.id ?? null,
      p_limit: limit,
    });
    if (error) throw toAppError(error, "ve_admin_list_audit_logs");
    const page = parseContract(auditPageResultSchema, data, "ve_admin_list_audit_logs");
    const last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor: page.hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }
}

/** Exclusive upper bound for an inclusive UTC "to" date. */
function nextDay(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
