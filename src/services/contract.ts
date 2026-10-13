import "server-only";
import type { z } from "zod";
import { InternalError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Validates data returned by the database against the expected contract.
 * A mismatch is a server bug: it is logged and surfaced as a generic 500,
 * never passed to the client unchecked.
 */
export function parseContract<T>(schema: z.ZodType<T>, data: unknown, operation: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logger.error("contract_violation", { operation });
    throw new InternalError();
  }
  return parsed.data;
}
