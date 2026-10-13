import type { ComponentProps } from "react";

interface SelectFieldProps extends ComponentProps<"select"> {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  error?: string;
}

/** Labelled select with an accessible error message, styled like Field. */
export function SelectField({ label, name, options, error, id, className = "", ...props }: SelectFieldProps) {
  const selectId = id ?? name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={selectId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={`rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary ${
          error ? "border-danger-text" : "border-border"
        } ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
