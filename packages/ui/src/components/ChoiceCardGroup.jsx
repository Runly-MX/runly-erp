import { cn } from "../lib/utils.js";

const COLUMN_CLASSES = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

// Single choice shown as selectable cards (radiogroup), for options that read
// better with a small visual: label sizes, layouts, plans. Each option:
// { value, label, description?, icon?, preview? (ReactNode), disabled? }.
// The selected card is a flat fill (no ring/glow), rounded-md.
export function ChoiceCardGroup({
  options = [],
  value,
  onChange,
  columns = 3,
  size = "md",
  disabled = false,
  ariaLabel,
  className,
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-2", COLUMN_CLASSES[columns] ?? COLUMN_CLASSES[3], className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon ?? null;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || option.disabled}
            onClick={() => onChange?.(option.value)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1.5 rounded-md border text-center transition-colors",
              size === "sm" ? "px-2 py-2" : "px-2.5 py-3",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-primary bg-primary/12 text-[hsl(var(--foreground))] [&_svg]:text-primary"
                : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.6)]",
            )}
          >
            {option.preview ?? (Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null)}
            <span className={cn("max-w-full truncate font-medium", size === "sm" ? "text-xs" : "text-sm")}>{option.label}</span>
            {option.description ? (
              <span className={cn("text-[11px] leading-tight", active ? "opacity-80" : "text-[hsl(var(--muted-foreground))]")}>
                {option.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
