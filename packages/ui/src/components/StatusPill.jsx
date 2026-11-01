import { cn } from "../lib/utils.js";

// Operational state with icon + text, never color alone. Soft fill with a
// dark text of the same hue keeps 4.5:1 in light and dark (the solid Badge
// success/warning/destructive variants put white on 2.1-3.8:1 fills).
const TONES = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300",
  danger:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300",
  brand:
    "border-(--brand-primary)/30 bg-(--brand-soft) text-(--brand-primary-text) dark:text-(--brand-primary-on-dark)",
  neutral:
    "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
};

export function StatusPill({ tone = "neutral", icon: Icon = null, children, className, title, size = "md" }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border font-semibold",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        TONES[tone] ?? TONES.neutral,
        className,
      )}
    >
      {Icon ? <Icon className={size === "sm" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
