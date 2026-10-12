import { Activity, Grid3X3, LayoutList, Rows3 } from "lucide-react";
import { cn } from "../lib/utils.js";

const VIEW_META = {
  table: { Icon: Rows3, label: "Tabla" },
  cards: { Icon: LayoutList, label: "Tarjetas" },
  grid: { Icon: Grid3X3, label: "Cuadrícula" },
  timeline: { Icon: Activity, label: "Línea de tiempo" },
};

/**
 * ViewModeSwitch — segmented control for Tabla / Cards / Cuadrícula view modes.
 * Persists selection in localStorage when `storageKey` is provided.
 */
export function ViewModeSwitch({
  modes = ["table", "cards", "grid"],
  value,
  onChange,
  storageKey,
}) {
  function handleChange(mode) {
    if (storageKey) {
      try {
        localStorage.setItem(`runly-view-mode-${storageKey}`, mode);
      } catch {}
    }
    onChange(mode);
  }

  return (
    <div className="inline-flex rounded-xl border border-[hsl(var(--border))] bg-card overflow-hidden shrink-0">
      {modes.map((mode) => {
        const meta = VIEW_META[mode];
        if (!meta) return null;
        const { Icon, label } = meta;
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => handleChange(mode)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center transition-colors duration-150",
              active
                ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

/** Read the persisted view mode for a module from localStorage. */
export function getStoredViewMode(storageKey, defaultMode = "cards") {
  if (!storageKey) return defaultMode;
  try {
    return localStorage.getItem(`runly-view-mode-${storageKey}`) ?? defaultMode;
  } catch {
    return defaultMode;
  }
}
