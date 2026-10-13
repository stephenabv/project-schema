"use client";

import { Award, Bot, Factory, Hand, LayoutDashboard, ShoppingBag, Target, Trophy, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the bottom tab bar below md. */
  mobile: boolean;
  /** Shorter label for the bottom tab bar. */
  mobileLabel?: string;
  /** Other pages that light up this tab in the bottom bar (the Shop tab also covers the Robot Shop). */
  mobileAlso?: readonly string[];
};

/** Badges, Ranks and Robots have no tab of their own on phones: Robots sits inside the Shop tab. */
export const APP_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true, mobileLabel: "Home" },
  { href: "/earn", label: "Earn", icon: Hand, mobile: true },
  { href: "/robots", label: "Robots", icon: Bot, mobile: false },
  { href: "/generator", label: "Generator", icon: Factory, mobile: true },
  { href: "/missions", label: "Missions", icon: Target, mobile: true },
  { href: "/achievements", label: "Badges", icon: Award, mobile: false },
  { href: "/leaderboard", label: "Ranks", icon: Trophy, mobile: false },
  { href: "/shop", label: "Shop", icon: ShoppingBag, mobile: true, mobileAlso: ["/robots"] },
  { href: "/wallet", label: "Wallet", icon: Wallet, mobile: true },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Top (md and up): icon links, with a small label under each icon from lg so
 * all nine fit beside the account buttons. Bottom (below md): fixed six-tab bar.
 */
export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "top" ? "hidden items-center gap-0.5 md:flex" : "grid grid-cols-6"}>
      {APP_NAV.filter((item) => variant === "top" || item.mobile).map(({ href, label, mobileLabel, mobileAlso, icon: Icon }) => {
        const active =
          isActive(pathname, href) || (variant === "bottom" && (mobileAlso ?? []).some((path) => isActive(pathname, path)));
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              title={variant === "top" ? label : undefined}
              className={
                variant === "top"
                  ? `flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-2 text-[11px] font-medium leading-none lg:px-2 lg:py-1.5 ${
                      active ? "bg-success-surface text-success-text" : "text-muted hover:text-foreground"
                    }`
                  : `flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                      active ? "text-primary" : "text-muted"
                    }`
              }
            >
              <Icon aria-hidden className="size-4" />
              <span className={variant === "top" ? "sr-only lg:not-sr-only lg:whitespace-nowrap" : "whitespace-nowrap"}>
                {variant === "bottom" ? (mobileLabel ?? label) : label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
