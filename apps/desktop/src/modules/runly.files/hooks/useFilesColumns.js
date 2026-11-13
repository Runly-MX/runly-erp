import { useCallback, useEffect, useState } from "react";

const KEY = "runly-files-columns-v1";
export const COLUMN_DEFAULTS = { modified: 150, kind: 120, size: 90 };
export const COLUMN_LIMITS = { modified: [90, 320], kind: [70, 260], size: [60, 200] };
const clamp = (col, w) => Math.max(COLUMN_LIMITS[col][0], Math.min(COLUMN_LIMITS[col][1], Math.round(w)));

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return Object.fromEntries(Object.keys(COLUMN_DEFAULTS).map((c) => [c, Number.isFinite(saved[c]) ? clamp(c, saved[c]) : COLUMN_DEFAULTS[c]]));
  } catch {
    return { ...COLUMN_DEFAULTS };
  }
}

// Widths (px) of the resizable list columns, remembered per browser. The name
// column takes whatever is left.
export function useFilesColumns() {
  const [widths, setWidths] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(widths));
    } catch {
      /* storage blocked */
    }
  }, [widths]);
  const setWidth = useCallback((col, w) => setWidths((prev) => ({ ...prev, [col]: clamp(col, w) })), []);
  const reset = useCallback((col) => setWidths((prev) => ({ ...prev, [col]: COLUMN_DEFAULTS[col] })), []);
  return { widths, setWidth, reset };
}

// Width of an element, kept up to date (drives which columns fit).
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// Which columns fit: all of them, date + size only, or just the name (phones).
export function columnLayout(width, coarse) {
  const full = width >= 760;
  const medium = width >= 520;
  return { showKind: full, showModified: medium, showSize: medium, compact: !medium, coarse };
}

export function gridTemplate(layout, widths) {
  const cols = ["32px", "minmax(160px,1fr)"];
  if (layout.showModified) cols.push(`${widths.modified}px`);
  if (layout.showKind) cols.push(`${widths.kind}px`);
  if (layout.showSize) cols.push(`${widths.size}px`);
  if (layout.coarse) cols.push("36px");
  cols.push("44px");
  return cols.join(" ");
}
