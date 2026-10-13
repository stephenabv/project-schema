import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { WalletService } from "@/services/wallet";

/** GET /api/wallet: the caller's virtual (non-redeemable) balance. */
export const GET = apiHandler("GET /api/wallet", async () => {
  const { supabase, user } = await requireAuthenticatedUser();
  return json(await new WalletService(supabase).getWallet(user.id));
});
