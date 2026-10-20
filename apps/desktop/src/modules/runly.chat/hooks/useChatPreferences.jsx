// apps/desktop/src/modules/runly.chat/hooks/useChatPreferences.jsx
// Personal chat display preferences (font size, accent color, wallpaper
// visibility) — persisted server-side via the existing generic per-user
// preference store (UserPreference: userId+key -> Json value, exposed as
// GET/PUT /profile/me/preferences/:key, atlas.profile.get/setPreference in
// the SDK), so they follow the user across devices instead of staying stuck
// on one machine. localStorage is kept ONLY as an instant-paint cache — the
// UI reads it first so there's no flash of default values before the server
// round-trip resolves, but the server copy always wins once it loads.
//
// A React Context (not just a bare hook) is required because several
// unrelated components need to react to the SAME live value —
// ChatSettingsDialog writes a change, ChatMessageList/MessageComposer need
// to re-render with it immediately. Independent hook instances each reading
// their own state wouldn't see each other's writes.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";
import { deriveBrandVars } from "../../../lib/brandTheme.js";

const STORAGE_KEY = "atlas_chat_prefs_v1";
const PREF_KEY = "chat_prefs";
const PREF_QUERY_KEY = ["chat-preferences"];
// update() can fire several times in quick succession (clicking through
// accent color swatches, say) — no need to PUT on every intermediate click
// when only the last one actually matters.
const SAVE_DEBOUNCE_MS = 600;

export const DEFAULT_PREFS = {
  fontScale: 1,
  // "brand" = no local override, inherit the company's own --brand-primary
  // (see styles.css) — the historical, still-default behavior.
  accentColorKey: "brand",
  // Hex used when accentColorKey === "custom".
  accentCustom: "#7c5cff",
  wallpaper: true,
  // Pattern drawn behind the messages (only when `wallpaper` is on).
  wallpaperStyle: "doodles",
  // Tone mixed into the chat background; "default" leaves the theme as is.
  background: "default",
  // Corner radius of the message bubbles.
  bubbleShape: "round",
};

export const WALLPAPER_STYLES = [
  { key: "doodles", label: "Dibujos" },
  { key: "dots", label: "Puntos" },
  { key: "grid", label: "Cuadricula" },
  { key: "lines", label: "Lineas" },
];

// `tone` is blended at a low strength into the theme background, so every
// option stays readable in both light and dark mode. "accent" follows the
// chosen accent color.
export const BACKGROUND_TONES = [
  { key: "default", label: "Predeterminado", tone: null },
  { key: "accent", label: "Color de acento", tone: "accent" },
  { key: "warm", label: "Calido", tone: "#f59e0b" },
  { key: "cool", label: "Frio", tone: "#3b82f6" },
  { key: "mint", label: "Menta", tone: "#10b981" },
  { key: "rose", label: "Rosado", tone: "#f43f5e" },
  { key: "slate", label: "Pizarra", tone: "#64748b" },
];

export const BUBBLE_SHAPES = [
  { key: "round", label: "Redondeadas", radius: "1.125rem", tail: "0.375rem" },
  { key: "soft", label: "Muy redondeadas", radius: "1.5rem", tail: "0.5rem" },
  { key: "square", label: "Rectas", radius: "0.5rem", tail: "0.125rem" },
];

export const FONT_SCALE_OPTIONS = [
  { key: "sm", label: "Pequena", value: 0.9 },
  { key: "md", label: "Mediana", value: 1 },
  { key: "lg", label: "Grande", value: 1.15 },
  { key: "xl", label: "Extra grande", value: 1.3 },
];

// `primary`/`foreground` null on the first entry — chatPreferencesStyle
// below leaves --brand-primary alone in that case, so the company's real
// brand color (whatever CompanyBranding.jsx has set) keeps showing through.
// Every other preset's accent hex is also the one the bubbles use, picked up
// by the .chat-wallpaper-layer[data-accent] rules in chat-theme.css (via the
// --chat-wallpaper-ink custom property) so the background pattern leans toward
// the chosen color instead of staying a flat neutral gray regardless of accent.
export const ACCENT_PRESETS = [
  { key: "brand", label: "Marca de la empresa", primary: null, foreground: null },
  { key: "violet", label: "Violeta", primary: "#7c5cff", foreground: "#ffffff" },
  { key: "green", label: "Verde", primary: "#16a34a", foreground: "#ffffff" },
  { key: "blue", label: "Azul", primary: "#2563eb", foreground: "#ffffff" },
  { key: "pink", label: "Rosa", primary: "#db2777", foreground: "#ffffff" },
  { key: "orange", label: "Naranja", primary: "#ea580c", foreground: "#ffffff" },
  { key: "teal", label: "Turquesa", primary: "#0891b2", foreground: "#ffffff" },
  { key: "red", label: "Rojo", primary: "#dc2626", foreground: "#ffffff" },
  { key: "amber", label: "Ambar", primary: "#d97706", foreground: "#ffffff" },
  { key: "lime", label: "Lima", primary: "#65a30d", foreground: "#ffffff" },
  { key: "emerald", label: "Esmeralda", primary: "#059669", foreground: "#ffffff" },
  { key: "indigo", label: "Indigo", primary: "#4f46e5", foreground: "#ffffff" },
  { key: "fuchsia", label: "Fucsia", primary: "#c026d3", foreground: "#ffffff" },
  { key: "slate", label: "Grafito", primary: "#475569", foreground: "#ffffff" },
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

// The accent hex in effect, or null for "Marca de la empresa".
export function resolveAccentHex(prefs) {
  if (prefs.accentColorKey === "custom") return HEX_RE.test(prefs.accentCustom ?? "") ? prefs.accentCustom : null;
  return resolveAccentPreset(prefs.accentColorKey).primary;
}

export function resolveAccentPreset(key) {
  return ACCENT_PRESETS.find((p) => p.key === key) ?? ACCENT_PRESETS[0];
}

// Inline-style object for the .chat-glass-theme root — --chat-zoom always
// set, --brand-primary/--brand-primary-foreground only when the user picked
// something other than "brand" (letting the company's real token cascade
// through untouched otherwise).
export function chatPreferencesStyle(prefs) {
  const accent = resolveAccentHex(prefs);
  const shape = BUBBLE_SHAPES.find((s) => s.key === prefs.bubbleShape) ?? BUBBLE_SHAPES[0];
  const bg = BACKGROUND_TONES.find((b) => b.key === prefs.background);
  const tone = bg?.tone === "accent" ? (accent ?? "var(--brand-primary)") : bg?.tone;
  return {
    "--chat-zoom": prefs.fontScale,
    "--chat-radius-bubble": shape.radius,
    "--chat-radius-bubble-tail": shape.tail,
    ...(tone ? { "--chat-bg": `color-mix(in srgb, ${tone} 9%, hsl(var(--background)))` } : {}),
    // Every derived brand token (hover, ring, dark variant...), not only the
    // base color, so nothing keeps the company hue under a personal accent.
    ...(accent ? deriveBrandVars(accent) : {}),
  };
}

// Props for the wallpaper layer (all places that paint it share these).
export function wallpaperLayerProps(prefs) {
  const accent = resolveAccentHex(prefs);
  const rgb = accent ? [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)) : null;
  return {
    className: "chat-wallpaper-layer",
    "data-accent": prefs.accentColorKey,
    "data-pattern": prefs.wallpaperStyle ?? "doodles",
    "aria-hidden": "true",
    style: rgb ? { "--chat-wallpaper-ink": `rgba(${rgb.join(", ")}, 0.09)` } : undefined,
  };
}

function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function saveLocalPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Unavailable (private browsing, quota) — harmless, the server copy is
    // the real source of truth; this was only ever the instant-paint cache.
  }
}

const ChatPreferencesContext = createContext(null);

export function ChatPreferencesProvider({ children }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [prefs, setPrefs] = useState(loadLocalPrefs);
  const saveTimerRef = useRef(null);
  const queryClient = useQueryClient();

  // React Query dedupes this across every simultaneously-mounted Provider
  // (multiple floating MiniChatWindows each have their own) — same
  // queryKey, one actual network request.
  const { data: serverValue } = useQuery({
    queryKey: PREF_QUERY_KEY,
    queryFn: async () => {
      const res = await runly.profile.getPreference(PREF_KEY, token);
      return res?.value ?? null;
    },
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  // Server wins once it resolves — reconciles whatever localStorage/defaults
  // were showing during the round-trip with the real, cross-device value.
  useEffect(() => {
    if (serverValue && typeof serverValue === "object") {
      setPrefs((prev) => ({ ...prev, ...serverValue }));
    }
  }, [serverValue]);

  useEffect(() => {
    saveLocalPrefs(prefs);
  }, [prefs]);

  const update = useCallback(
    (patch) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        // Every mounted ChatPreferencesProvider (ChatScreen's own, plus one
        // per open MiniChatWindow) reads this same PREF_QUERY_KEY cache entry
        // — without pushing the change there too, an already-open floating
        // window kept showing its stale color/font/wallpaper choice until
        // closed and reopened, since only THIS instance's own local state
        // (and the PUT below) knew about the change.
        queryClient.setQueryData(PREF_QUERY_KEY, next);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          if (token) runly.profile.setPreference(PREF_KEY, next, token).catch(() => {});
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [token, queryClient],
  );

  return (
    <ChatPreferencesContext.Provider value={{ prefs, update }}>
      {children}
    </ChatPreferencesContext.Provider>
  );
}

// Falls back to read-only defaults (a no-op `update`) instead of throwing
// when rendered outside a ChatPreferencesProvider — ChatMessageList.jsx is
// reused by screens (e.g. ExternalInboxScreen.jsx) that may not always wrap
// themselves in one; better to render with sane defaults there than crash
// the whole screen over a personal display preference.
const NOOP_UPDATE = () => {};
export function useChatPreferences() {
  const ctx = useContext(ChatPreferencesContext);
  return ctx ?? { prefs: DEFAULT_PREFS, update: NOOP_UPDATE };
}
