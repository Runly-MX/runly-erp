import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "../lib/utils.js";

const clampInt = (value, min, max, fallback) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// Compact integer stepper: [-] value [+]. The text commits on blur/Enter so
// typing "25" is not clamped mid-way. size "md" gives 44px touch targets,
// "sm" 36px for dense desktop rows. `label` is the accessible name.
export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  step = 1,
  label,
  size = "md",
  disabled = false,
  className,
}) {
  const [text, setText] = useState(String(value ?? min));
  useEffect(() => { setText(String(value ?? min)); }, [value, min]);

  const commit = (raw) => {
    const next = clampInt(raw, min, max, Number(value) || min);
    setText(String(next));
    if (next !== value) onChange?.(next);
  };
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const btn = cn(
    "flex shrink-0 items-center justify-center text-[hsl(var(--muted-foreground))] transition-colors",
    "hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]",
    "disabled:cursor-not-allowed disabled:opacity-40",
    box,
  );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))]",
        disabled && "opacity-60",
        className,
      )}
    >
      <button type="button" className={btn} aria-label="Disminuir" disabled={disabled || Number(value) <= min}
        onClick={() => commit(Number(value) - step)}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(text); }
          if (e.key === "ArrowUp") { e.preventDefault(); commit(Number(value) + step); }
          if (e.key === "ArrowDown") { e.preventDefault(); commit(Number(value) - step); }
        }}
        className={cn(
          "w-11 min-w-0 border-x border-[hsl(var(--input))] bg-transparent text-center text-sm font-medium tabular-nums text-[hsl(var(--foreground))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]",
        )}
      />
      <button type="button" className={btn} aria-label="Aumentar" disabled={disabled || Number(value) >= max}
        onClick={() => commit(Number(value) + step)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
