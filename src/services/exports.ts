import "server-only";
import { toCsv, type CsvValue } from "@/lib/csv/csv";
import type { AdminUser, AuditEntry } from "@/lib/validation/admin";
import type { EconomyPoint, ExportDataset } from "@/lib/validation/operations";
import { AdminService } from "./admin";

/** Hard cap on exported rows, so one request cannot run unbounded. */
export const EXPORT_ROW_LIMIT = 5000;
const USERS_BATCH = 100;
const AUDIT_BATCH = 200;
const ECONOMY_DAYS = 90;

export interface CsvExport {
  filename: string;
  csv: string;
  rows: number;
  truncated: boolean;
}

type Column<T> = { header: string; value: (row: T) => CsvValue };

const USER_COLUMNS: Column<AdminUser>[] = [
  { header: "id", value: (u) => u.id },
  { header: "username", value: (u) => u.username },
  { header: "email", value: (u) => u.email },
  { header: "role", value: (u) => u.role },
  { header: "balance_vc", value: (u) => u.balanceCoins },
  { header: "xp_total", value: (u) => u.xpTotal },
  { header: "level", value: (u) => u.level },
  { header: "total_taps", value: (u) => u.totalTaps },
  { header: "missions_completed", value: (u) => u.missionsCompleted },
  { header: "suspended_at", value: (u) => u.suspendedAt },
  { header: "suspension_reason", value: (u) => u.suspensionReason },
  { header: "created_at", value: (u) => u.createdAt },
  { header: "last_active_on", value: (u) => u.lastActiveOn },
];

const AUDIT_COLUMNS: Column<AuditEntry>[] = [
  { header: "id", value: (e) => e.id },
  { header: "created_at", value: (e) => e.createdAt },
  { header: "actor_id", value: (e) => e.actorId },
  { header: "actor_username", value: (e) => e.actorUsername },
  { header: "action", value: (e) => e.action },
  { header: "target_type", value: (e) => e.targetType },
  { header: "target_id", value: (e) => e.targetId },
  { header: "metadata", value: (e) => JSON.stringify(e.metadata) },
];

const ECONOMY_COLUMNS: Column<EconomyPoint>[] = [
  { header: "day_utc", value: (p) => p.day },
  { header: "tap_vc", value: (p) => p.tapCoins },
  { header: "mission_vc", value: (p) => p.missionCoins },
  { header: "badge_vc", value: (p) => p.badgeCoins },
  { header: "daily_bonus_vc", value: (p) => p.bonusCoins },
  { header: "generator_vc", value: (p) => p.idleCoins },
  { header: "spent_vc", value: (p) => p.spentCoins },
  { header: "admin_adjustment_vc", value: (p) => p.adjustmentCoins },
];

/**
 * CSV exports for the admin console. Data comes from the same ve_admin_*
 * functions as the console (each re-checks the admin role). Amounts are
 * virtual coins with no monetary value.
 */
export class ExportService {
  private readonly admin: AdminService;

  constructor(admin: AdminService) {
    this.admin = admin;
  }

  async export(dataset: ExportDataset, now: Date = new Date()): Promise<CsvExport> {
    const stamp = now.toISOString().slice(0, 10);
    switch (dataset) {
      case "users": {
        const { rows, truncated } = await this.users();
        return { filename: `virtual-earn-users-${stamp}.csv`, csv: toCsv(USER_COLUMNS, rows), rows: rows.length, truncated };
      }
      case "audit-logs": {
        const { rows, truncated } = await this.auditLogs();
        return { filename: `virtual-earn-audit-log-${stamp}.csv`, csv: toCsv(AUDIT_COLUMNS, rows), rows: rows.length, truncated };
      }
      case "economy": {
        const rows = await this.admin.economySeries(ECONOMY_DAYS);
        return { filename: `virtual-earn-economy-${stamp}.csv`, csv: toCsv(ECONOMY_COLUMNS, rows), rows: rows.length, truncated: false };
      }
    }
  }

  private async users(): Promise<{ rows: AdminUser[]; truncated: boolean }> {
    const rows: AdminUser[] = [];
    for (let page = 1; rows.length < EXPORT_ROW_LIMIT; page += 1) {
      const batch = await this.admin.listUsers(undefined, page, USERS_BATCH);
      rows.push(...batch.items);
      if (batch.items.length < USERS_BATCH || rows.length >= batch.total) {
        return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: batch.total > EXPORT_ROW_LIMIT };
      }
    }
    return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: true };
  }

  private async auditLogs(): Promise<{ rows: AuditEntry[]; truncated: boolean }> {
    const rows: AuditEntry[] = [];
    let cursor: string | undefined;
    while (rows.length < EXPORT_ROW_LIMIT) {
      const page = await this.admin.listAuditLogs({ cursor }, AUDIT_BATCH);
      rows.push(...page.items);
      if (!page.nextCursor) return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: false };
      cursor = page.nextCursor;
    }
    return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: true };
  }
}
