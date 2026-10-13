import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <Logo />
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
