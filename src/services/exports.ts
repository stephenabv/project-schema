import "server-only";
import { toCsv, type CsvValue } from "@/lib/csv/csv";
import type { AdminUser, AuditEntry } from "@/lib/validation/admin";
import type { EconomyPoint, ExportDataset } from "@/lib/validation/operations";
import type { AdminConversion, AdminPayout } from "@/lib/validation/redemption";
import { AdminService } from "./admin";
import type { FinanceAdminService, Page, RequestFilter } from "./finance-admin";

/** Hard cap on exported rows, so one request cannot run unbounded. */
export const EXPORT_ROW_LIMIT = 5000;
const USERS_BATCH = 100;
const AUDIT_BATCH = 200;
const REQUEST_BATCH = 500;
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

const CONVERSION_COLUMNS: Column<AdminConversion>[] = [
  { header: "reference", value: (c) => c.reference },
  { header: "status", value: (c) => c.status },
  { header: "user_id", value: (c) => c.userId },
  { header: "username", value: (c) => c.username },
  { header: "coins_vc", value: (c) => c.coins },
  { header: "rate_vc", value: (c) => c.rateCoins },
  { header: "rate_centavos", value: (c) => c.rateCentavos },
  { header: "php_centavos", value: (c) => c.phpCentavos },
  { header: "rejection_reason", value: (c) => c.rejectionReason },
  { header: "review_note", value: (c) => c.reviewNote },
  { header: "reviewed_by", value: (c) => c.reviewedBy },
  { header: "created_at", value: (c) => c.createdAt },
  { header: "updated_at", value: (c) => c.updatedAt },
  { header: "completed_at", value: (c) => c.completedAt },
];

// Account details are never exported; only the masked hint.
const PAYOUT_COLUMNS: Column<AdminPayout>[] = [
  { header: "reference", value: (p) => p.reference },
  { header: "status", value: (p) => p.status },
  { header: "user_id", value: (p) => p.userId },
  { header: "username", value: (p) => p.username },
  { header: "amount_centavos", value: (p) => p.amountCentavos },
  { header: "method", value: (p) => p.methodCode },
  { header: "account_hint", value: (p) => p.accountHint },
  { header: "payment_reference", value: (p) => p.paymentReference },
  { header: "rejection_reason", value: (p) => p.rejectionReason },
  { header: "review_note", value: (p) => p.reviewNote },
  { header: "reviewed_by", value: (p) => p.reviewedBy },
  { header: "created_at", value: (p) => p.createdAt },
  { header: "updated_at", value: (p) => p.updatedAt },
  { header: "paid_at", value: (p) => p.paidAt },
];

/**
 * CSV exports for the admin console. Data comes from the same ve_admin_*
 * functions as the console (each re-checks the admin role). Amounts are
 * virtual coins with no monetary value.
 */
export class ExportService {
  constructor(
    private readonly admin: AdminService,
    private readonly finance?: FinanceAdminService,
  ) {}

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
      case "conversions": {
        const finance = this.requireFinance();
        const { rows, truncated } = await this.pages((filter) => finance.listConversions(filter, REQUEST_BATCH));
        return { filename: `virtual-earn-conversions-${stamp}.csv`, csv: toCsv(CONVERSION_COLUMNS, rows), rows: rows.length, truncated };
      }
      case "payouts": {
        const finance = this.requireFinance();
        const { rows, truncated } = await this.pages((filter) => finance.listPayouts(filter, REQUEST_BATCH));
        return { filename: `virtual-earn-payouts-${stamp}.csv`, csv: toCsv(PAYOUT_COLUMNS, rows), rows: rows.length, truncated };
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

  private requireFinance(): FinanceAdminService {
    if (!this.finance) throw new Error("ExportService needs a FinanceAdminService for request exports");
    return this.finance;
  }

  /** Reads offset pages of requests (newest first) up to the export cap. */
  private async pages<T>(load: (filter: RequestFilter) => Promise<Page<T>>): Promise<{ rows: T[]; truncated: boolean }> {
    const rows: T[] = [];
    for (let page = 1; rows.length < EXPORT_ROW_LIMIT; page += 1) {
      const batch = await load({ page });
      rows.push(...batch.items);
      if (batch.items.length < REQUEST_BATCH || rows.length >= batch.total) {
        return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: batch.total > EXPORT_ROW_LIMIT };
      }
    }
    return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: true };
  }
}
