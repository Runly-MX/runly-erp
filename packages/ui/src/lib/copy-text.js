// Clipboard helpers shared by CopyOnDoubleClick and the copy buttons.
const EMPTY_VALUES = new Set(["", "—", "-", "null", "undefined"]);

// Text worth copying, or "" when the value is blank / a placeholder.
export function copyableText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return EMPTY_VALUES.has(text) ? "" : text;
}

export function copiedMessage(text, max = 48) {
  const clean = String(text ?? "");
  return `Copiado: ${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}`;
}

// navigator.clipboard when available (secure contexts), otherwise a hidden
// textarea + execCommand (Tauri / insecure origins). Resolves true on success.
export async function copyText(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText && globalThis.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  const active = document.activeElement;
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
    if (active && typeof active.focus === "function") active.focus();
  }
}
