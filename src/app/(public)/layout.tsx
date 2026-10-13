import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav aria-label="Main" className="flex items-center gap-2">
            <ButtonLink href="/about" variant="ghost">
              About
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary">
              Sign in
            </ButtonLink>
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
