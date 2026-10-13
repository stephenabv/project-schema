import { z } from "zod";

export const TRANSACTION_TYPES = ["tap_reward", "mission_reward", "achievement_reward", "admin_adjustment"] as const;

const isoDate = z.iso.date("Use YYYY-MM-DD dates");

/** Query parameters accepted by GET /api/transactions and the wallet page. */
export const transactionQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().max(256).optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ["from"],
    error: "The start date must not be after the end date",
  });

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

/** Converts URLSearchParams (or a Next.js searchParams object) to a plain record, dropping empty values. */
export function queryRecord(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string> {
  const entries =
    params instanceof URLSearchParams
      ? Array.from(params.entries())
      : Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const);

  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value === "string" && value.trim() !== "") result[key] = value.trim();
  }
  return result;
}
