import { Bot, Cog, Cpu, Hammer, Rocket, Satellite, Shield, type LucideIcon } from "lucide-react";
import { TIER_LABELS, type RobotImageKey, type RobotTier } from "@/lib/validation/robots";

const ICONS: Record<RobotImageKey, LucideIcon> = {
  scout: Bot,
  worker: Cog,
  forge: Hammer,
  titan: Shield,
  nova: Rocket,
  drone: Satellite,
  mech: Cpu,
};

/** Tier colours: a gradient tile with a white icon reads the same in light and dark themes. */
const TIER_TILES: Record<RobotTier, string> = {
  common: "bg-gradient-to-br from-slate-400 to-slate-600",
  uncommon: "bg-gradient-to-br from-emerald-400 to-teal-600",
  rare: "bg-gradient-to-br from-sky-400 to-blue-600",
  epic: "bg-gradient-to-br from-fuchsia-500 to-violet-600",
  legendary: "bg-gradient-to-br from-amber-400 to-orange-600",
};

const TIER_BADGES: Record<RobotTier, string> = {
  common: "bg-background text-muted",
  uncommon: "bg-success-surface text-success-text",
  rare: "border border-border bg-surface text-(--chart-blue)",
  epic: "border border-border bg-surface text-(--chart-purple)",
  legendary: "bg-warning-surface text-warning-text",
};

export function RobotArt({ imageKey, tier, size = "md" }: { imageKey: RobotImageKey; tier: RobotTier; size?: "sm" | "md" }) {
  const Icon = ICONS[imageKey];
  const box = size === "sm" ? "size-10 rounded-xl" : "size-16 rounded-2xl";
  const icon = size === "sm" ? "size-5" : "size-8";
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center text-white shadow-sm ${box} ${TIER_TILES[tier]}`}>
      <Icon className={icon} />
    </span>
  );
}

export function TierBadge({ tier }: { tier: RobotTier }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIER_BADGES[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}
