import { afterEach, describe, expect, it, vi } from "vitest";
import { PayloadTooLargeError, RateLimitError, ValidationError } from "@/lib/errors";
import { apiHandler, readJsonBody } from "@/lib/http/api";

const post = (body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers });

afterEach(() => vi.restoreAllMocks());

describe("readJsonBody", () => {
  it("parses a small JSON body", async () => {
    await expect(readJsonBody(post('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it("requires a JSON content type", async () => {
    await expect(readJsonBody(post("{}", { "Content-Type": "text/plain" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects malformed JSON", async () => {
    await expect(readJsonBody(post("{oops"))).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces the size cap even without a Content-Length header", async () => {
    await expect(readJsonBody(post(JSON.stringify({ pad: "x".repeat(2000) })))).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });
});

describe("apiHandler", () => {
  it("renders domain errors with status, code and headers", async () => {
    const handler = apiHandler("test", async () => {
      throw new RateLimitError("COOLDOWN_ACTIVE", "slow down", 1);
    });
    const response = await handler();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "slow down", code: "COOLDOWN_ACTIVE" });
  });

  it("hides unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = apiHandler("test", async () => {
      throw new Error("connection string postgres://secret");
    });
    const response = await handler();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
