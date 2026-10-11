import { useEffect, useRef } from "react";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

// Meet-style shortcuts. Ignored while typing in a field (chat composer, etc.).
//  Ctrl/⌘ + D          micrófono
//  Ctrl/⌘ + E          cámara
//  Ctrl/⌘ + Shift + H  levantar / bajar la mano
//  Ctrl/⌘ + Shift + C  chat
//  Ctrl/⌘ + Shift + P  personas
export const CALL_SHORTCUTS = [
  { keys: `${MOD_LABEL} D`, label: "Activar o desactivar micrófono" },
  { keys: `${MOD_LABEL} E`, label: "Activar o desactivar cámara" },
  { keys: `${MOD_LABEL} Shift H`, label: "Levantar o bajar la mano" },
  { keys: `${MOD_LABEL} Shift C`, label: "Abrir o cerrar el chat" },
  { keys: `${MOD_LABEL} Shift P`, label: "Abrir o cerrar personas" },
];

export function useCallShortcuts(handlers, { enabled = true } = {}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event) {
      const mod = IS_MAC ? event.metaKey : event.ctrlKey;
      if (!mod || event.altKey) return;
      const target = event.target;
      const typing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
      const key = event.key.toLowerCase();
      const map = event.shiftKey
        ? { h: "toggleHand", c: "toggleChat", p: "togglePeople" }
        : { d: "toggleMic", e: "toggleCamera" };
      const action = map[key];
      if (!action || !ref.current?.[action]) return;
      if (typing && !event.shiftKey) return;
      event.preventDefault();
      ref.current[action]();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
