import { Coins } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
        <Coins aria-hidden className="size-4" />
      </span>
      Virtual Earn
    </Link>
  );
}
