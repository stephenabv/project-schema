import { describe, expect, it, vi } from "vitest";
import { BonusClient } from "@/lib/api/bonus-client";
import { ShopClient } from "@/lib/api/shop-client";
import { avatarFrameClass, tapSkinClass } from "@/lib/cosmetics/styles";

const KEY = "3f0c1b5e-8a8e-4b7e-9f57-7d6c1c7f2a10";
const ITEM = "6a1d6a3e-2f7b-4c1e-9d55-1b2c3d4e5f60";
const noSleep = async () => {};

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("BonusClient", () => {
  it("returns the server's claim", async () => {
    const fetch = respond(200, { success: true, rewardCoins: 20 });
    const outcome = await new BonusClient(fetch, noSleep).claim(KEY);
    expect(outcome).toMatchObject({ kind: "success", data: { rewardCoins: 20 } });
    expect(fetch).toHaveBeenCalledWith("/api/daily-bonus", expect.objectContaining({ body: JSON.stringify({ idempotencyKey: KEY }) }));
  });

  it("maps 409 ALREADY_CLAIMED and 401", async () => {
    expect(await new BonusClient(respond(409, { code: "ALREADY_CLAIMED", error: "x" }), noSleep).claim(KEY)).toEqual({
      kind: "already_claimed",
    });
    expect(await new BonusClient(respond(401, {}), noSleep).claim(KEY)).toEqual({ kind: "unauthenticated" });
  });

  it("retries a gateway error with the same key", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await new BonusClient(fetch, noSleep).claim(KEY);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  });
});

describe("ShopClient", () => {
  it.each([
    ["INSUFFICIENT_BALANCE", "insufficient_balance"],
    ["LEVEL_REQUIRED", "level_required"],
    ["ALREADY_OWNED", "already_owned"],
  ])("maps %s to %s", async (code, kind) => {
    const outcome = await new ShopClient(respond(409, { code, error: "x" }), noSleep).purchase(ITEM, KEY);
    expect(outcome).toEqual({ kind });
  });

  it("shows the server message for other errors", async () => {
    const outcome = await new ShopClient(respond(404, { code: "NOT_FOUND", error: "Record not found" }), noSleep).purchase(ITEM, KEY);
    expect(outcome).toEqual({ kind: "error", message: "Record not found" });
  });

  it("encodes the item id in the URL", async () => {
    const fetch = respond(200, { tapSkin: null, avatarFrame: null, title: null });
    await new ShopClient(fetch, noSleep).equip("../admin", false);
    expect(fetch).toHaveBeenCalledWith("/api/shop/..%2Fadmin/equip", expect.anything());
  });
});

describe("cosmetic styles", () => {
  it("falls back to the default look for unknown keys", () => {
    expect(tapSkinClass("unknown")).toContain("bg-primary");
    expect(tapSkinClass(null)).toContain("bg-primary");
    expect(tapSkinClass("ocean")).toContain("from-sky-400");
    expect(avatarFrameClass("gold")).toContain("ring-amber-400");
    expect(avatarFrameClass("__proto__")).toBe("");
  });
});
