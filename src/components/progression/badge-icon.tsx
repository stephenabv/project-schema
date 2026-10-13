import {
  Award,
  Coins,
  Crown,
  Gem,
  Hand,
  Medal,
  MousePointerClick,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icon keys stored on achievements map to a fixed set of icons; unknown keys fall back to Award. */
const ICONS: Record<string, LucideIcon> = {
  award: Award,
  coins: Coins,
  crown: Crown,
  gem: Gem,
  hand: Hand,
  medal: Medal,
  "mouse-pointer-click": MousePointerClick,
  star: Star,
  target: Target,
  trophy: Trophy,
  zap: Zap,
};

export const BADGE_ICON_KEYS = Object.keys(ICONS);

export function BadgeIcon({ icon, className = "size-5" }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Award;
  return <Icon aria-hidden className={className} />;
}
