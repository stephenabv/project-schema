import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";

describe("ledger cursor", () => {
  it("round-trips Postgres timestamps with microsecond precision", () => {
    const cursor = { createdAt: "2026-10-12T17:42:06.123456+00:00", id: "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10" };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it.each([
    "not-base64-json",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ c: "yesterday", i: "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10" })).toString("base64url"),
    Buffer.from(JSON.stringify({ c: "2026-10-12T00:00:00Z", i: "1; drop table" })).toString("base64url"),
  ])("rejects tampered cursor %j", (raw) => {
    expect(() => decodeCursor(raw)).toThrow(ValidationError);
  });
});
