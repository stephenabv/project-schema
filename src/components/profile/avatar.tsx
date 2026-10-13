import { Coins, Crown, Flame, Gem, Leaf, Rocket, Star, Zap, type LucideIcon } from "lucide-react";
import { avatarFrameClass } from "@/lib/cosmetics/styles";
import type { AvatarKey } from "@/lib/validation/profile";

export const AVATAR_ICONS: Record<AvatarKey, LucideIcon> = {
  coins: Coins,
  rocket: Rocket,
  star: Star,
  leaf: Leaf,
  flame: Flame,
  crown: Crown,
  gem: Gem,
  zap: Zap,
};

const SIZES = { sm: "size-8 rounded-lg [&>svg]:size-4", md: "size-12 rounded-xl [&>svg]:size-6", lg: "size-20 rounded-2xl [&>svg]:size-10" };

export function isAvatarKey(value: string): value is AvatarKey {
  return Object.hasOwn(AVATAR_ICONS, value);
}

/** A preset avatar, optionally wrapped in an equipped cosmetic frame. */
export function Avatar({
  avatarKey,
  size = "md",
  frame = null,
}: {
  avatarKey: AvatarKey;
  size?: keyof typeof SIZES;
  frame?: string | null;
}) {
  const Icon = AVATAR_ICONS[avatarKey];
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-primary text-white ${SIZES[size]} ${avatarFrameClass(frame)}`}
    >
      <Icon aria-hidden />
    </span>
  );
}
