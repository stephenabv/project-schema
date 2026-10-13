/**
 * Presentation for cosmetic style keys stored in shop_items.style_key.
 * Unknown keys fall back to the default look, so a new database item never
 * breaks rendering.
 */
const TAP_SKINS: Record<string, string> = {
  sunset: "bg-gradient-to-br from-orange-400 to-rose-500 shadow-rose-500/30",
  ocean: "bg-gradient-to-br from-sky-400 to-blue-600 shadow-blue-600/30",
  aurora: "bg-gradient-to-br from-fuchsia-500 via-violet-500 to-teal-400 shadow-violet-500/30",
};

const DEFAULT_TAP_SKIN = "bg-primary shadow-primary/30 hover:bg-primary-hover";

const AVATAR_FRAMES: Record<string, string> = {
  gold: "ring-4 ring-amber-400 ring-offset-2 ring-offset-surface",
  neon: "ring-4 ring-fuchsia-400 ring-offset-2 ring-offset-surface shadow-lg shadow-fuchsia-400/50",
};

function lookup(styles: Record<string, string>, key: string | null | undefined): string | undefined {
  // Own keys only, so "__proto__" or "constructor" never resolve to Object members.
  return key && Object.hasOwn(styles, key) ? styles[key] : undefined;
}

export function tapSkinClass(styleKey: string | null | undefined): string {
  return lookup(TAP_SKINS, styleKey) ?? DEFAULT_TAP_SKIN;
}

export function avatarFrameClass(styleKey: string | null | undefined): string {
  return lookup(AVATAR_FRAMES, styleKey) ?? "";
}
