/** Icon keys an achievement may use. Must match the icons mapped in components/progression/badge-icon.tsx. */
export const BADGE_ICON_KEYS = [
  "award",
  "coins",
  "crown",
  "gem",
  "hand",
  "medal",
  "mouse-pointer-click",
  "star",
  "target",
  "trophy",
  "zap",
] as const;

export type BadgeIconKey = (typeof BADGE_ICON_KEYS)[number];
