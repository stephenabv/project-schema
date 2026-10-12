import "server-only";
import { z } from "zod";
import { InternalError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";
import { toAppError } from "@/lib/supabase/errors";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { TRANSACTION_TYPES, type TransactionQuery } from "@/lib/validation/transactions";
import type { TransactionDto, TransactionPage, WalletResponse } from "@/types/api";

const ledgerRowSchema = z.object({
  id: z.uuid(),
  amount_coins: z.number().int(),
  type: z.enum(TRANSACTION_TYPES),
  source_type: z.string(),
  source_id: z.string().nullable(),
  created_at: z.string(),
});

/** Read-only access to the caller's virtual wallet and ledger (RLS-scoped). */
export class WalletService {
  constructor(private readonly db: AppSupabaseClient) {}

  async getWallet(userId: string): Promise<WalletResponse> {
    const { data, error } = await this.db
      .from("wallets")
      .select("balance_coins, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw toAppError(error, "get_wallet");
    if (!data) throw new NotFoundError("Wallet not found");

    return {
      balanceCoins: data.balance_coins,
      currency: "VC",
      label: "Virtual coins",
      redeemable: false,
      updatedAt: data.updated_at,
    };
  }

  async listTransactions(query: TransactionQuery): Promise<TransactionPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    // Fetch one extra row to know whether another page exists.
    const { data, error } = await this.db.rpc("list_transactions", {
      p_limit: query.limit + 1,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_type: query.type ?? null,
      p_from: query.from ?? null,
      p_to: query.to ?? null,
    });
    if (error) throw toAppError(error, "list_transactions");

    const rows = z.array(ledgerRowSchema).safeParse(data);
    if (!rows.success) {
      logger.error("contract_violation", { operation: "list_transactions" });
      throw new InternalError();
    }

    const hasMore = rows.data.length > query.limit;
    const items: TransactionDto[] = rows.data.slice(0, query.limit).map((row) => ({
      id: row.id,
      amountCoins: row.amount_coins,
      type: row.type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      createdAt: row.created_at,
    }));
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      currency: "VC",
      redeemable: false,
    };
  }
}
