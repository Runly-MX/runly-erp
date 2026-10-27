// Whether the floating MirAI edge tab is shown. A per-viewer convenience kept in
// localStorage; MirAI itself stays available (openMiraiSidebar, Alt+Shift+M).
import { useSyncExternalStore } from "react";

const KEY = "mirai.tab.hidden";
const listeners = new Set();

function read() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
let hidden = read();

export function isMiraiTabHidden() {
  return hidden;
}

export function setMiraiTabHidden(value) {
  hidden = Boolean(value);
  try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch { /* ignore */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMiraiTabHidden() {
  return useSyncExternalStore(subscribe, isMiraiTabHidden, () => false);
}

// Alt+M toggles the tab, Alt+Shift+M opens/closes the panel. Ignored while typing
// (on macOS Option+M types a character).
export function miraiShortcut(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== "KeyM") return null;
  const target = event.target;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return null;
  return event.shiftKey ? "panel" : "tab";
}
