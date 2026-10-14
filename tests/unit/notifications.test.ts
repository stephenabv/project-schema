import { describe, expect, it } from "vitest";
import { notificationLinkLabel } from "@/components/notifications/notification-meta";
import { InternalError, NotFoundError } from "@/lib/errors";
import { NotificationService } from "@/services/notifications";
import { createFakeSupabase } from "./support/fake-supabase";

const ID = "5b1f7f2e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";

const row = {
  id: ID,
  kind: "badge",
  title: "Badge unlocked: First Tap",
  body: "+10 virtual coins added to your wallet.",
  link: "/achievements",
  created_at: "2026-10-14T01:00:00+00:00",
  read_at: null,
};

describe("NotificationService.get", () => {
  it("reads one of the caller's notifications by id", async () => {
    const fake = createFakeSupabase({ table: { data: row, error: null } });
    const notification = await new NotificationService(fake.client).get(ID);

    expect(fake.from).toHaveBeenCalledWith("ve_notifications");
    expect(fake.chain.eq).toHaveBeenCalledWith("id", ID);
    expect(notification).toEqual({
      id: ID,
      kind: "badge",
      title: "Badge unlocked: First Tap",
      body: "+10 virtual coins added to your wallet.",
      link: "/achievements",
      createdAt: "2026-10-14T01:00:00+00:00",
      read: false,
    });
  });

  it("reports a read notification as read", async () => {
    const fake = createFakeSupabase({ table: { data: { ...row, read_at: "2026-10-14T02:00:00+00:00" }, error: null } });
    expect((await new NotificationService(fake.client).get(ID)).read).toBe(true);
  });

  it("throws NotFound when the row is missing or belongs to another player (RLS)", async () => {
    const fake = createFakeSupabase({ table: { data: null, error: null } });
    await expect(new NotificationService(fake.client).get(ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("drops a link that is not a same-site path", async () => {
    const fake = createFakeSupabase({ table: { data: { ...row, link: "//evil.example" }, error: null } });
    expect((await new NotificationService(fake.client).get(ID)).link).toBeNull();
  });

  it("rejects an unknown kind as a contract violation", async () => {
    const fake = createFakeSupabase({ table: { data: { ...row, kind: "spam" }, error: null } });
    await expect(new NotificationService(fake.client).get(ID)).rejects.toBeInstanceOf(InternalError);
  });
});

describe("notificationLinkLabel", () => {
  it("names the page a message leads to", () => {
    expect(notificationLinkLabel("/achievements")).toBe("Go to badges");
    expect(notificationLinkLabel("/payouts")).toBe("Go to payouts");
    expect(notificationLinkLabel("/generator")).toBe("Go to generator");
  });

  it("falls back to a generic label for unknown pages", () => {
    expect(notificationLinkLabel("/somewhere-new")).toBe("Open related page");
  });
});
