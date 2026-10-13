import Link from "next/link";
import { REWARD_RANGES, type RewardRange } from "@/lib/validation/progression";

/** Server-rendered range switcher; the selection lives in the URL (?range=). */
export function RangeTabs({ active }: { active: RewardRange }) {
  return (
    <nav aria-label="Chart range" className="flex gap-1 rounded-xl bg-background p-1">
      {(Object.keys(REWARD_RANGES) as RewardRange[]).map((range) => (
        <Link
          key={range}
          href={range === "14d" ? "/dashboard" : `/dashboard?range=${range}`}
          scroll={false}
          aria-current={range === active ? "page" : undefined}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
            range === active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {REWARD_RANGES[range].label}
        </Link>
      ))}
    </nav>
  );
}
