import { requireAdmin } from "@/lib/auth/require-admin";
import { NotFoundError } from "@/lib/errors";
import { apiHandler } from "@/lib/http/api";
import { logger } from "@/lib/logger";
import { EXPORT_DATASETS, type ExportDataset } from "@/lib/validation/operations";
import { AdminService } from "@/services/admin";
import { ExportService } from "@/services/exports";
import { FinanceAdminService } from "@/services/finance-admin";

function isDataset(value: string): value is ExportDataset {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

/**
 * GET /api/admin/exports/:dataset (users | audit-logs | economy | conversions | payouts)
 * Downloads a CSV (at most 5,000 rows). Cells that look like spreadsheet
 * formulas are neutralised; the response is never cached.
 */
export const GET = apiHandler(
  "GET /api/admin/exports/:dataset",
  async (_request: Request, ctx: RouteContext<"/api/admin/exports/[dataset]">) => {
    const { supabase, user } = await requireAdmin();
    const dataset = (await ctx.params).dataset;
    if (!isDataset(dataset)) throw new NotFoundError("Unknown export");

    const result = await new ExportService(new AdminService(supabase), new FinanceAdminService(supabase)).export(dataset);
    logger.info("admin_export", { dataset, rows: result.rows, truncated: result.truncated, actor: user.id });

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Truncated": String(result.truncated),
      },
    });
  },
);
