import { useEffect, useRef } from "react";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

// Keyboard shortcuts for AdvancedFileViewer, keyed by the `shortcut` id an
// action declares. Letter keys are matched case-insensitively and honour
// `shift`; symbol keys ignore shift so "+" works on any layout. `mod` is
// Cmd on macOS and Ctrl elsewhere.
export const VIEWER_SHORTCUTS = {
  prev: { keys: ["ArrowLeft"], label: "←" },
  next: { keys: ["ArrowRight"], label: "→" },
  copy: { keys: ["c"], mod: true },
  download: { keys: ["s"], mod: true },
  link: { keys: ["c"], mod: true, shift: true },
  open: { keys: ["o"], mod: true },
  zoomin: { keys: ["+", "="], label: "+" },
  zoomout: { keys: ["-", "_"], label: "-" },
  rotl: { keys: ["r"], shift: true },
  rotr: { keys: ["r"] },
  fliph: { keys: ["h"] },
  flipv: { keys: ["v"] },
  reset: { keys: ["0"] },
  play: { keys: [" ", "k"], label: "Espacio" },
  back: { keys: ["j"] },
  fwd: { keys: ["l"] },
  mute: { keys: ["m"] },
  fullscreen: { keys: ["f"] },
};

export function shortcutLabel(id) {
  const s = VIEWER_SHORTCUTS[id];
  if (!s) return null;
  const key = s.label ?? s.keys[0].toUpperCase();
  if (isMac) return `${s.shift ? "⇧" : ""}${s.mod ? "⌘" : ""}${key}`;
  return [s.mod && "Ctrl", s.shift && "Shift", key].filter(Boolean).join("+");
}

export function withShortcut(label, id) {
  const hint = shortcutLabel(id);
  return hint ? `${label} (${hint})` : label;
}

function matches(s, event) {
  if (!s) return false;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  const otherMod = isMac ? event.ctrlKey : event.metaKey;
  if (Boolean(s.mod) !== mod || otherMod || event.altKey) return false;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!s.keys.includes(key)) return false;
  if (/^[a-z]$/.test(key) && Boolean(s.shift) !== event.shiftKey) return false;
  return true;
}

// Window-level (capture phase, so a focused <video> doesn't seek on the
// arrows or toggle twice on Space) keyboard handling scoped to the viewer:
// keys typed in a field, or inside a portal outside the viewer (its context
// menu, the actions sheet, a dialog stacked on top) are left alone.
export function useViewerShortcuts({ enabled, containerRef, actions }) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event) {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      const root = containerRef.current;
      if (root && target instanceof Node && target !== document.body && !root.contains(target)) return;
      if (target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return;
      if (event.key === " " && target?.closest?.("button")) return;
      const action = actionsRef.current.find(
        (a) => a.shortcut && !a.disabled && matches(VIEWER_SHORTCUTS[a.shortcut], event),
      );
      if (!action) return;
      // Leave a real text selection (e.g. in the XML preview) to the native copy.
      if (action.shortcut === "copy" && window.getSelection?.()?.toString()) return;
      event.preventDefault();
      event.stopPropagation();
      action.onSelect();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, containerRef]);
}
