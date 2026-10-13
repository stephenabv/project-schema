"use client";

import { Award, Factory, Hand, LayoutDashboard, ShoppingBag, Target, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** `mobile` marks the five links that fit the bottom tab bar; the rest stay reachable from Profile. */
export const APP_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/earn", label: "Earn", icon: Hand, mobile: true },
  { href: "/generator", label: "Generator", icon: Factory, mobile: false },
  { href: "/missions", label: "Missions", icon: Target, mobile: true },
  { href: "/achievements", label: "Badges", icon: Award, mobile: false },
  { href: "/leaderboard", label: "Ranks", icon: Trophy, mobile: false },
  { href: "/shop", label: "Shop", icon: ShoppingBag, mobile: true },
  { href: "/wallet", label: "Wallet", icon: Wallet, mobile: true },
] as const;

/** Desktop: inline links (icons only until lg). Mobile: fixed bottom tab bar. */
export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "top" ? "hidden items-center gap-1 sm:flex" : "grid grid-cols-5"}>
      {APP_NAV.filter((item) => variant === "top" || item.mobile).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                variant === "top"
                  ? `flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium lg:px-3 ${
                      active ? "bg-success-surface text-success-text" : "text-muted hover:text-foreground"
                    }`
                  : `flex flex-col items-center gap-1 py-2 text-xs font-medium ${
                      active ? "text-primary" : "text-muted"
                    }`
              }
            >
              <Icon aria-hidden className="size-4" />
              <span className={variant === "top" ? "sr-only lg:not-sr-only" : undefined}>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
