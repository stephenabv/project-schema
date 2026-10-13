import Link from "next/link";
import { LogoMark } from "./logo-mark";

/** Brand link. With `compact`, the word mark only shows from the `sm` breakpoint so crowded headers fit on phones. */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 font-semibold" aria-label="Virtual Earn home">
      <LogoMark className="size-8 shrink-0" />
      <span className={compact ? "hidden sm:inline" : undefined}>Virtual Earn</span>
    </Link>
  );
}
