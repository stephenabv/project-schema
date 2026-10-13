import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/layout/logo";
import { NavLinks } from "@/components/layout/nav-links";
import { Button } from "@/components/ui/button";

/**
 * Signed-in area shell. It holds no user data so it prerenders; each page
 * verifies the session itself inside a Suspense boundary (the proxy redirect
 * is only a convenience, not the authorization check).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col pb-16 sm:pb-0">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo href="/dashboard" />
          <nav aria-label="Main">
            <NavLinks variant="top" />
          </nav>
          <form action={signOut}>
            <Button type="submit" variant="ghost" aria-label="Sign out">
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </form>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
      <nav aria-label="Main (mobile)" className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface sm:hidden">
        <NavLinks variant="bottom" />
      </nav>
    </div>
  );
}
