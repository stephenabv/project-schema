import { useId } from "react";

/**
 * The Virtual Earn mark: a coin with a "V" and a spark of progress. Kept in
 * sync with src/app/icon.svg and the generated PNG icons in public/icons
 * (see scripts/generate-icons.mjs).
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 64 64" aria-hidden focusable="false" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <circle cx="31" cy="34" r="17" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="4" />
      <path
        d="M23 26.5 31 42l8-15.5"
        fill="none"
        stroke="#fff"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M48 9.5l1.9 4.6 4.6 1.9-4.6 1.9L48 22.5l-1.9-4.6-4.6-1.9 4.6-1.9z" fill="#fde68a" />
    </svg>
  );
}
