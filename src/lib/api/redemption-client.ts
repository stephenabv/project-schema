import type { Conversion, Payout } from "@/lib/validation/redemption";
import { DEFAULT_BACKOFF_MS, IdempotentPoster, type FetchLike, type Sleep } from "./idempotent-post";
import { postOutcome, type ApiOutcome } from "./robot-client";

const hasReference = (body: unknown) => Boolean(body && typeof body === "object" && "reference" in body);

/** Browser client for conversion and payout requests. Retries reuse the idempotency key. */
export class RedemptionClient {
  private readonly poster: IdempotentPoster;

  constructor(fetchImpl?: FetchLike, sleep?: Sleep, backoffMs: readonly number[] = DEFAULT_BACKOFF_MS) {
    this.poster = new IdempotentPoster(fetchImpl, sleep, backoffMs);
  }

  requestConversion(coins: number, rateId: string, idempotencyKey: string): Promise<ApiOutcome<Conversion>> {
    return postOutcome(this.poster, "/api/conversions", { coins, rateId, idempotencyKey }, hasReference, "Unable to submit the request.");
  }

  cancelConversion(id: string): Promise<ApiOutcome<Conversion>> {
    return postOutcome(this.poster, `/api/conversions/${encodeURIComponent(id)}/cancel`, {}, hasReference, "Unable to cancel.");
  }

  requestPayout(input: {
    methodId: string;
    amountCentavos: number;
    accountName: string;
    accountNumber: string;
    idempotencyKey: string;
  }): Promise<ApiOutcome<Payout>> {
    return postOutcome(this.poster, "/api/payouts", input, hasReference, "Unable to submit the payout request.");
  }

  cancelPayout(id: string): Promise<ApiOutcome<Payout>> {
    return postOutcome(this.poster, `/api/payouts/${encodeURIComponent(id)}/cancel`, {}, hasReference, "Unable to cancel.");
  }
}
