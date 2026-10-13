import { describe, expect, it, vi } from "vitest";
import { fetchSessionStatus } from "@/lib/api/session-client";

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("fetchSessionStatus", () => {
  it("reports a signed-in session and never caches the answer", async () => {
    const fetcher = vi.fn(async () => respond(200, { authenticated: true }));
    await expect(fetchSessionStatus(fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  });

  it.each([
    ["signed out", () => respond(200, { authenticated: false })],
    ["a non-boolean flag", () => respond(200, { authenticated: "yes" })],
    ["a server error", () => respond(500, { error: "boom" })],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("treats %s as signed out", async (_label, make) => {
    await expect(fetchSessionStatus(vi.fn(async () => make()))).resolves.toBe(false);
  });

  it("treats a network failure as signed out", async () => {
    await expect(fetchSessionStatus(vi.fn(async () => Promise.reject(new TypeError("offline"))))).resolves.toBe(false);
  });
});
