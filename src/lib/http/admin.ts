import "server-only";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { readJsonBody } from "./api";

/** Admin payloads (missions, badges) are larger than player requests but still capped. */
export const ADMIN_MAX_JSON_BYTES = 4096;

/** A malformed id can never match a record, so it is reported as 404. */
export function parseRecordId(raw: string): string {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new NotFoundError("Record not found");
  return parsed.data;
}

/** Reads and validates an admin JSON body, reporting the first issue. */
export async function readAdminBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJsonBody(request, ADMIN_MAX_JSON_BYTES));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ValidationError(`${field}${issue?.message ?? "Invalid request"}`);
  }
  return parsed.data;
}
