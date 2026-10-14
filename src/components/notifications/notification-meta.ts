import { Award, CalendarCheck, ShieldAlert, ShoppingBag, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { AppNotification } from "@/lib/validation/engagement";

export const NOTIFICATION_KIND_ICONS: Record<AppNotification["kind"], LucideIcon> = {
  badge: Award,
  level: TrendingUp,
  bonus: CalendarCheck,
  shop: ShoppingBag,
  account: ShieldAlert,
  wallet: Wallet,
};

const PAGE_NAMES: Readonly<Record<string, string>> = {
  achievements: "badges",
  dashboard: "dashboard",
  earn: "Earn",
  exchange: "exchange",
  generator: "generator",
  leaderboard: "leaderboard",
  missions: "missions",
  payouts: "payouts",
  profile: "profile",
  robots: "robots",
  shop: "shop",
  wallet: "wallet",
};

/** The label for the button that leads from a message to the page it is about, such as "Go to badges". */
export function notificationLinkLabel(link: string): string {
  const page = PAGE_NAMES[link.split("/")[1] ?? ""];
  return page ? `Go to ${page}` : "Open related page";
}
