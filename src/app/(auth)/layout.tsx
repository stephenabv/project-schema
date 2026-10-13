import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
