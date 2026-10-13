"use client";

import { Check, Lock } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/profile/avatar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { VirtualBadge } from "@/components/ui/virtual-badge";
import { ShopClient } from "@/lib/api/shop-client";
import { tapSkinClass } from "@/lib/cosmetics/styles";
import { formatCoins, formatCount } from "@/lib/formatting/coins";
import type { Shop, ShopCategory, ShopItem } from "@/lib/validation/engagement";
import type { AvatarKey } from "@/lib/validation/profile";

type Notice = { tone: "success" | "warning" | "danger"; text: string; signedOut?: boolean };

const CATEGORIES: readonly { category: ShopCategory; heading: string; hint: string }[] = [
  { category: "tap_skin", heading: "Tap button skins", hint: "Changes the look of the Earn button." },
  { category: "avatar_frame", heading: "Avatar frames", hint: "A ring around your avatar on your profile and the leaderboard." },
  { category: "title", heading: "Titles", hint: "Shown next to your name on the leaderboard." },
];

/**
 * Cosmetic shop. Purchases spend virtual coins only and change appearance,
 * never earning power. The server checks price, level and balance.
 */
export function ShopGrid({ initialShop, avatarKey }: { initialShop: Shop; avatarKey: AvatarKey }) {
  const client = useMemo(() => new ShopClient(), []);
  const [shop, setShop] = useState(initialShop);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // One key per item, so a retried purchase replays instead of charging twice.
  const keys = useRef(new Map<string, string>());

  function updateItems(fn: (item: ShopItem) => ShopItem, balanceCoins = shop.balanceCoins) {
    setShop((s) => ({ ...s, balanceCoins, items: s.items.map(fn) }));
  }

  async function buy(item: ShopItem) {
    if (pendingId) return;
    const key = keys.current.get(item.id) ?? crypto.randomUUID();
    keys.current.set(item.id, key);
    setPendingId(item.id);
    setNotice(null);
    try {
      const outcome = await client.purchase(item.id, key);
      switch (outcome.kind) {
        case "success":
          updateItems((i) => (i.id === item.id ? { ...i, owned: true } : i), outcome.data.balanceCoins);
          setNotice({ tone: "success", text: `Unlocked ${item.name} for ${formatCoins(item.priceCoins)} (virtual). Equip it below.` });
          break;
        case "already_owned":
          updateItems((i) => (i.id === item.id ? { ...i, owned: true } : i));
          setNotice({ tone: "warning", text: `You already own ${item.name}.` });
          break;
        case "insufficient_balance":
          keys.current.delete(item.id);
          setNotice({ tone: "warning", text: "Not enough virtual coins yet. Keep tapping!" });
          break;
        case "level_required":
          keys.current.delete(item.id);
          setNotice({ tone: "warning", text: `Reach level ${item.levelRequired} to unlock ${item.name}.` });
          break;
        case "unauthenticated":
          setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
          break;
        case "error":
          keys.current.delete(item.id);
          setNotice({ tone: "danger", text: outcome.message });
          break;
      }
    } finally {
      setPendingId(null);
    }
  }

  async function toggleEquip(item: ShopItem) {
    if (pendingId) return;
    setPendingId(item.id);
    setNotice(null);
    const equip = !item.equipped;
    try {
      const outcome = await client.equip(item.id, equip);
      switch (outcome.kind) {
        case "success":
          updateItems((i) =>
            i.id === item.id ? { ...i, equipped: equip } : i.category === item.category && equip ? { ...i, equipped: false } : i,
          );
          setNotice({ tone: "success", text: equip ? `Equipped ${item.name}.` : `Removed ${item.name}.` });
          break;
        case "unauthenticated":
          setNotice({ tone: "danger", text: "Your session has ended.", signedOut: true });
          break;
        case "error":
          setNotice({ tone: "danger", text: outcome.message });
          break;
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>Virtual balance</CardTitle>
          <p className="text-2xl font-bold tabular-nums">{formatCoins(shop.balanceCoins)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <VirtualBadge />
          <span className="text-xs text-muted">Level {formatCount(shop.level)}</span>
        </div>
      </Card>

      <div aria-live="polite">
        {notice ? (
          <Alert tone={notice.tone}>
            {notice.text}{" "}
            {notice.signedOut ? (
              <Link href="/login?next=/shop" className="font-semibold underline">
                Sign in again
              </Link>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {CATEGORIES.map(({ category, heading, hint }) => {
        const items = shop.items.filter((i) => i.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`shop-${category}`} className="flex flex-col gap-3">
            <div>
              <h2 id={`shop-${category}`} className="text-base font-semibold">
                {heading}
              </h2>
              <p className="text-xs text-muted">{hint}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li key={item.id}>
                  <ShopCard
                    item={item}
                    avatarKey={avatarKey}
                    level={shop.level}
                    balance={shop.balanceCoins}
                    pending={pendingId === item.id}
                    onBuy={buy}
                    onToggle={toggleEquip}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ShopCard({
  item,
  avatarKey,
  level,
  balance,
  pending,
  onBuy,
  onToggle,
}: {
  item: ShopItem;
  avatarKey: AvatarKey;
  level: number;
  balance: number;
  pending: boolean;
  onBuy: (item: ShopItem) => void;
  onToggle: (item: ShopItem) => void;
}) {
  const locked = !item.owned && level < item.levelRequired;
  const affordable = balance >= item.priceCoins;

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex h-20 items-center justify-center rounded-xl bg-background">
        <Preview item={item} avatarKey={avatarKey} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{item.name}</h3>
          <p className="text-xs text-muted">{item.description}</p>
        </div>
        {item.owned ? null : (
          <span className="shrink-0 rounded-full bg-success-surface px-2.5 py-1 text-xs font-semibold text-success-text tabular-nums">
            {formatCoins(item.priceCoins)}
          </span>
        )}
      </div>
      <div className="mt-auto">
        {item.owned ? (
          <Button
            variant={item.equipped ? "secondary" : "primary"}
            onClick={() => onToggle(item)}
            disabled={pending}
            aria-label={`${item.equipped ? "Unequip" : "Equip"} ${item.name}`}
            className="w-full"
          >
            {item.equipped ? (
              <>
                <Check aria-hidden className="size-4" /> Equipped
              </>
            ) : (
              "Equip"
            )}
          </Button>
        ) : locked ? (
          <p className="flex items-center justify-center gap-1 rounded-xl border border-border py-2.5 text-sm text-muted">
            <Lock aria-hidden className="size-4" /> Level {item.levelRequired} required
          </p>
        ) : (
          <Button
            onClick={() => onBuy(item)}
            disabled={pending || !affordable}
            aria-label={`Buy ${item.name} for ${formatCoins(item.priceCoins)}`}
            className="w-full"
          >
            {pending ? "Buying…" : affordable ? "Buy" : "Not enough VC"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Preview({ item, avatarKey }: { item: ShopItem; avatarKey: AvatarKey }) {
  switch (item.category) {
    case "tap_skin":
      return <span aria-hidden className={`size-14 rounded-full text-white shadow-lg ${tapSkinClass(item.styleKey)}`} />;
    case "avatar_frame":
      return <Avatar avatarKey={avatarKey} size="md" frame={item.styleKey} />;
    case "title":
      return <span className="text-sm font-semibold text-primary">{item.name}</span>;
  }
}
