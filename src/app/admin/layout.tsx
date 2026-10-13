import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav, AdminNavList } from "@/components/admin/admin-nav";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Logo href="/admin" compact />
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning-text">
              <ShieldCheck aria-hidden className="size-3.5" /> Admin
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ThemeToggle />
            <ButtonLink href="/dashboard" variant="ghost" aria-label="Back to app" size="icon" className="sm:px-4">
              <ArrowLeft aria-hidden className="size-4" />
              <span className="hidden sm:inline">Back to app</span>
            </ButtonLink>
          </div>
        </div>
      </header>
      {/* minmax(0, 1fr) and min-w-0 stop wide children (the scrolling tab row, charts, tables) from widening the page. */}
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Admin" className="min-w-0">
          <Suspense fallback={<AdminNavList pathname={null} />}>
            <AdminNav />
          </Suspense>
        </nav>
        <main id="content" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
