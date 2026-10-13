import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | Virtual Earn" },
  robots: { index: false, follow: false },
};

/**
 * Admin shell. It holds no data; every page verifies the admin role itself
 * (and every database call verifies it again).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="flex items-center gap-1 rounded-full bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning-text">
              <ShieldCheck aria-hidden className="size-3.5" /> Admin
            </span>
          </div>
          <ButtonLink href="/dashboard" variant="ghost">
            <ArrowLeft aria-hidden className="size-4" /> Back to app
          </ButtonLink>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Admin">
          <AdminNav />
        </nav>
        <main id="content" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
