import type { ComponentProps } from "react";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

/** Labelled input with an accessible, programmatically linked error message. */
export function Field({ label, name, error, hint, id, className = "", ...props }: FieldProps) {
  const inputId = id ?? name;
  const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary ${
          error ? "border-danger-text" : "border-border"
        } ${className}`}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
