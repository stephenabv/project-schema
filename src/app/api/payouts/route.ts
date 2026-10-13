import { requireAuthenticatedUser } from "@/lib/auth/require-user";
import { apiHandler, json } from "@/lib/http/api";
import { parseBody } from "@/lib/http/validate";
import { payoutRequestSchema } from "@/lib/validation/redemption";
import { RedemptionService } from "@/services/redemption";

/** GET /api/payouts: your payout requests (account numbers are masked). */
export const GET = apiHandler("GET /api/payouts", async () => {
  const { supabase } = await requireAuthenticatedUser();
  return json({ items: await new RedemptionService(supabase).payouts() });
});

/**
 * POST /api/payouts  { methodId, amountCentavos, accountName, accountNumber, idempotencyKey }
 * Requests a payout from your approved peso balance. Account details are
 * encrypted before they are stored. A request is not a payment: it is paid
 * only after an admin sends and verifies it.
 */
export const POST = apiHandler("POST /api/payouts", async (request: Request) => {
  const { supabase } = await requireAuthenticatedUser();
  const input = await parseBody(request, payoutRequestSchema);
  return json(await new RedemptionService(supabase).requestPayout(input), { status: 201 });
});
