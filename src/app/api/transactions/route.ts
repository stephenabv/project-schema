import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { ValidationError } from "@/lib/errors";
import { apiHandler, json } from "@/lib/http/api";
import { queryRecord, transactionQuerySchema } from "@/lib/validation/transactions";
import { WalletService } from "@/services/wallet";

/**
 * GET /api/transactions?limit=&cursor=&type=&from=&to=
 * Keyset-paginated ledger of the caller's virtual coin entries.
 */
export const GET = apiHandler("GET /api/transactions", async (request: NextRequest) => {
  const { supabase } = await requireAuthenticatedUser();

  const parsed = transactionQuerySchema.safeParse(queryRecord(request.nextUrl.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid query");

  return json(await new WalletService(supabase).listTransactions(parsed.data));
});
