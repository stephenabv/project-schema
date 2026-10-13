import { AccountLink } from "@/components/auth/account-link";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ButtonLink } from "@/components/ui/button";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
          <Logo compact />
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ButtonLink href="/about" variant="ghost">
              About
            </ButtonLink>
            <ThemeToggle />
            <AccountLink />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        Virtual Earn is a simulator. Virtual coins have no monetary value.
      </footer>
    </div>
  );
}
