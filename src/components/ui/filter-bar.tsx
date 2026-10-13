import type { ComponentProps, ReactNode } from "react";
import { buttonClass } from "./button";

/**
 * Shared layout for the GET filter forms (wallet activity, admin players,
 * audit log). Filters live in the URL, so they are shareable and work
 * without JavaScript.
 *
 * Phones: a two-column grid; "full" fields span the screen, "half" fields
 * (date ranges) sit side by side, and the buttons are right-aligned on
 * their own row. From `sm` up: one row whose fields share the container
 * width, buttons at the end.
 */
export function FilterBar({
  action,
  label,
  role,
  children,
  actions,
}: {
  action: string;
  label: string;
  role?: "search";
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      role={role}
      aria-label={label}
      className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
    >
      {children}
      <div className="col-span-2 flex items-center justify-end gap-2 sm:ml-auto sm:shrink-0">{actions}</div>
    </form>
  );
}

/** One labelled control. `grow` sets how much of a desktop row it takes relative to its siblings. */
export function FilterField({
  label,
  span = "full",
  grow = 1,
  children,
}: {
  label: string;
  span?: "full" | "half";
  grow?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-w-0 flex-col gap-1 text-xs font-medium text-muted ${span === "full" ? "col-span-2" : "col-span-1"} ${
        grow === 2 ? "sm:min-w-56 sm:flex-[2_1_0%]" : "sm:min-w-36 sm:flex-[1_1_0%]"
      }`}
    >
      {label}
      {children}
    </label>
  );
}

/** Inputs and selects stretch to their field; text stays readable in both themes. */
export const filterControlClass =
  "w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

export function FilterInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${filterControlClass} ${className}`} {...props} />;
}

export function FilterSelect({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${filterControlClass} ${className}`} {...props} />;
}

/** Reset (a plain link back to the unfiltered page) and the submit button, right-aligned. */
export function FilterActions({ resetHref, submitLabel = "Apply" }: { resetHref?: string; submitLabel?: string }) {
  return (
    <>
      {resetHref ? (
        <a href={resetHref} className={buttonClass("ghost")}>
          Reset
        </a>
      ) : null}
      <button type="submit" className={buttonClass("primary")}>
        {submitLabel}
      </button>
    </>
  );
}
