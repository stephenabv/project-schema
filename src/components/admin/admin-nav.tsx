"use client";

import {
  Activity,
  ArrowLeftRight,
  Award,
  Banknote,
  Bot,
  ClipboardList,
  Gauge,
  Scale,
  ScrollText,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/analytics", label: "Analytics", icon: Activity },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/tasks", label: "Missions", icon: ClipboardList },
  { href: "/admin/achievements", label: "Badges", icon: Award },
  { href: "/admin/robots", label: "Robots", icon: Bot },
  { href: "/admin/exchange", label: "Exchange", icon: ArrowLeftRight },
  { href: "/admin/conversions", label: "Conversions", icon: Wallet },
  { href: "/admin/payouts", label: "Payouts", icon: Banknote },
  { href: "/admin/ledger", label: "Ledger check", icon: Scale },
  { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
  { href: "/admin/audit-logs", label: "Audit log", icon: ScrollText },
] as const;

export function AdminNav() {
  return <AdminNavList pathname={usePathname()} />;
}

/**
 * The link list. Rendered with no pathname as the Suspense fallback, so
 * dynamic admin routes (such as a payout review) can still prerender a shell.
 */
export function AdminNavList({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex flex-wrap gap-1 lg:flex-col">
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
        const active =
          pathname !== null && (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
        return (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${
                active ? "bg-success-surface text-success-text" : "text-muted hover:text-foreground"
              }`}
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
