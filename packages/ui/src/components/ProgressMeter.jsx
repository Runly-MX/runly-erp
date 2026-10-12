import { cn } from "../lib/utils.js";

// Threshold-aware progress bar with an optional label row.
// tone: 'auto' colours by pct vs. `warnAt` (amber) and 1.0 (red); or force
// 'brand' | 'success' | 'warning' | 'danger'.
export function ProgressMeter({
  value = 0,
  max = 1,
  warnAt = 0.8,
  tone = "auto",
  label,
  valueLabel,
  className,
  barClassName,
  size = "md",
}) {
  const pct = max > 0 ? value / max : 0;
  const clamped = Math.max(0, Math.min(1, pct));
  const resolvedTone =
    tone !== "auto"
      ? tone
      : pct >= 1
        ? "danger"
        : pct >= warnAt
          ? "warning"
          : "success";
  const fill = {
    brand: "bg-[var(--brand-primary)]",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
  }[resolvedTone];
  const track = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={cn("w-full", className)}>
      {(label || valueLabel) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          {label && (
            <span className="truncate font-medium text-[hsl(var(--foreground))]">{label}</span>
          )}
          {valueLabel && (
            <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div
        className={cn("w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]", track)}
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", fill, barClassName)}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}
