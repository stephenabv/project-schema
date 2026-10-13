import "server-only";
import type { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { readJsonBody } from "./api";

/** Reads a small JSON body and validates it, reporting the first issue (field and message only). */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ValidationError(`${field}${issue?.message ?? "Invalid request"}`);
  }
  return parsed.data;
}
