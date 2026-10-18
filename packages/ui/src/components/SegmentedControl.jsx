import { cn } from "../lib/utils.js";

// Flat single-choice control for short, fixed option sets
// (e.g. contact type). Keyboard: native buttons in a radiogroup.
export function SegmentedControl({ options = [], value, onChange, disabled = false, className, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full flex-wrap gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange?.(option.value)}
            className={cn(
              "flex-1 min-w-[88px] whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              active
                ? "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
