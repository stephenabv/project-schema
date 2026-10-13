import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";
/** `icon`: a compact square-ish button for header icons (its label shows only on wider screens, if at all). */
type Size = "md" | "icon";

// Padding lives in SIZES, not BASE, so a size never fights another padding utility.
const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const SIZES: Record<Size, string> = {
  md: "px-4",
  icon: "px-2.5",
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  ghost: "text-muted hover:bg-background hover:text-foreground",
};

export function buttonClass(variant: Variant = "primary", extra = "", size: Size = "md"): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, className, size)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, className, size)} {...props} />;
}
