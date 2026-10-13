import { z } from "zod";
import { ValidationError } from "@/lib/errors";

const cursorSchema = z.strictObject({
  c: z.iso.datetime({ offset: true }),
  i: z.uuid(),
});

export interface LedgerCursor {
  createdAt: string;
  id: string;
}

/** Opaque, URL-safe keyset cursor over (created_at, id). */
export function encodeCursor(cursor: LedgerCursor): string {
  return Buffer.from(JSON.stringify({ c: cursor.createdAt, i: cursor.id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): LedgerCursor {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return { createdAt: parsed.c, id: parsed.i };
  } catch {
    throw new ValidationError("Invalid pagination cursor");
  }
}
