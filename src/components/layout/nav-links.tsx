"use client";

import { Hand, LayoutDashboard, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const APP_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/earn", label: "Earn", icon: Hand },
  { href: "/wallet", label: "Wallet", icon: Wallet },
] as const;

/** Desktop: inline links. Mobile: fixed bottom tab bar. */
export function NavLinks({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();

  return (
    <ul className={variant === "top" ? "hidden items-center gap-1 sm:flex" : "grid grid-cols-3"}>
      {APP_NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                variant === "top"
                  ? `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
                      active ? "bg-success-surface text-success-text" : "text-muted hover:text-foreground"
                    }`
                  : `flex flex-col items-center gap-1 py-2 text-xs font-medium ${
                      active ? "text-primary" : "text-muted"
                    }`
              }
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
