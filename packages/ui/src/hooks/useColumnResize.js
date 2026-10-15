import { useCallback, useEffect, useRef, useState } from "react";

export const COLUMN_MIN_WIDTH = 64;
export const COLUMN_MAX_WIDTH = 640;
const DEFAULT_WIDTH = 160;
const PREFIX = "runly:table-widths:";

export function clampWidth(value, min = COLUMN_MIN_WIDTH, max = COLUMN_MAX_WIDTH) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readWidths(storageKey) {
  if (!storageKey) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, clampWidth(v)]));
  } catch {
    return {};
  }
}

function writeWidths(storageKey, widths) {
  if (!storageKey) return;
  try {
    if (Object.keys(widths).length) localStorage.setItem(PREFIX + storageKey, JSON.stringify(widths));
    else localStorage.removeItem(PREFIX + storageKey);
  } catch {
    // Storage can be blocked; widths then last for the session only.
  }
}

// Per-table column widths, kept in this browser only (localStorage). Until the
// user drags a handle the table keeps its automatic layout; the first drag
// freezes every visible column at its current width so nothing jumps.
//   headerProps(key)  -> props for the <th> (key marker + width)
//   handleProps(key)  -> props for <ColumnResizeHandle />
//   tableProps(keys, extra) -> style for <table> (fixed layout once resized)
export function useColumnResize(storageKey, { min = COLUMN_MIN_WIDTH, max = COLUMN_MAX_WIDTH } = {}) {
  const [widths, setWidths] = useState(() => readWidths(storageKey));
  const latest = useRef(widths);
  latest.current = widths;

  useEffect(() => { setWidths(readWidths(storageKey)); }, [storageKey]);

  const resized = Object.keys(widths).length > 0;
  const widthFor = useCallback((key) => widths[key] ?? DEFAULT_WIDTH, [widths]);

  const startResize = useCallback((event, key) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest("tr");
    const base = {};
    row?.querySelectorAll("th[data-col-key]").forEach((th) => {
      base[th.dataset.colKey] = latest.current[th.dataset.colKey] ?? clampWidth(th.getBoundingClientRect().width, min, max);
    });
    const startX = event.clientX;
    const startWidth = base[key] ?? DEFAULT_WIDTH;
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let next = { ...latest.current, ...base };
    setWidths(next);

    const onMove = (e) => {
      next = { ...next, [key]: clampWidth(startWidth + e.clientX - startX, min, max) };
      setWidths(next);
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      writeWidths(storageKey, next);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }, [storageKey, min, max]);

  const reset = useCallback(() => {
    setWidths({});
    writeWidths(storageKey, {});
  }, [storageKey]);

  const nudge = useCallback((key, delta) => {
    const current = latest.current[key] ?? DEFAULT_WIDTH;
    const next = { ...latest.current, [key]: clampWidth(current + delta, min, max) };
    setWidths(next);
    writeWidths(storageKey, next);
  }, [storageKey, min, max]);

  return {
    resized,
    reset,
    widthFor,
    headerProps: (key) => ({
      "data-col-key": key,
      ...(resized ? { style: { width: widthFor(key), minWidth: widthFor(key), maxWidth: widthFor(key) } } : {}),
    }),
    handleProps: (key) => ({
      onPointerDown: (event) => startResize(event, key),
      onDoubleClick: reset,
      onKeyDown: (event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); nudge(key, -16); }
        if (event.key === "ArrowRight") { event.preventDefault(); nudge(key, 16); }
      },
    }),
    tableProps: (keys, extra = 0) => (resized
      ? { style: { tableLayout: "fixed", width: keys.reduce((sum, key) => sum + widthFor(key), extra), minWidth: "100%" } }
      : {}),
  };
}
