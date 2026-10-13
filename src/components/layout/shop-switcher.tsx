import { Bot, ShoppingBag } from "lucide-react";
import Link from "next/link";

const SHOPS = [
  { href: "/robots", label: "Robots", icon: Bot },
  { href: "/shop", label: "Cosmetics", icon: ShoppingBag },
] as const;

/** Switches between the two shops, so the phone's single Shop tab reaches both. */
export function ShopSwitcher({ current }: { current: (typeof SHOPS)[number]["href"] }) {
  return (
    <nav aria-label="Shops" className="mb-4">
      <ul className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
        {SHOPS.map(({ href, label, icon: Icon }) => {
          const active = href === current;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
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
    </nav>
  );
}
