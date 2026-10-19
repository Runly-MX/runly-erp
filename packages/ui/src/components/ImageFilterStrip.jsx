import { useEffect, useRef } from "react";
import { FILTER_PRESETS, presetFilter, presetTint } from "../lib/imageFilters.js";
import { applyColorFallback, applyTint, supportsCanvasFilter } from "../lib/canvasColor.js";

function Thumb({ thumb, preset, selected, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !thumb) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const filter = { id: preset.id, amount: 100 };
    const native = supportsCanvasFilter();
    ctx.filter = native ? presetFilter(filter) || "none" : "none";
    ctx.drawImage(thumb, 0, 0);
    if (!native) applyColorFallback(canvas, filter, null);
    applyTint(canvas, presetTint(filter));
  }, [thumb, preset]);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-24 w-20 shrink-0 flex-col items-center gap-1.5 rounded-lg p-1.5 text-xs transition-colors lg:w-full ${selected ? "bg-[hsl(var(--primary))]/15 text-[hsl(var(--foreground))] ring-2 ring-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"}`}
    >
      <canvas ref={ref} width={96} height={96} className="aspect-square w-full rounded-md bg-[hsl(var(--muted))]" />
      <span className="font-medium">{preset.label}</span>
    </button>
  );
}

// Preset looks as live thumbnails of the current picture. Scrolls sideways on
// touch layouts and becomes a 3-column grid in the side panel.
export function ImageFilterStrip({ thumb, value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Filtros" className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
      {FILTER_PRESETS.map((preset) => (
        <Thumb key={preset.id} thumb={thumb} preset={preset} selected={value.id === preset.id} onSelect={() => onChange(preset.id)} />
      ))}
    </div>
  );
}
