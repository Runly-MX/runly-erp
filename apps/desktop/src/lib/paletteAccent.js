// Accent color of a command-palette row. Module rows and actions carry their
// module color; everything else (records, scope/suggestion rows, pages, help,
// commands) gets a color from its module or its kind, so no row is monochrome.

const KIND_ACCENT = {
  widen: "#7c3aed",
  suggestion: "#f59e0b",
  "see-all": "#64748b",
  recent: "#64748b",
};
const SOURCE_ACCENT = { help: "#0ea5e9" };
const PAGE_ACCENT = { home: "#0ea5e9", profile: "#ec4899" };
const FALLBACK = "#7c3aed";

export function itemAccent(item) {
  if (!item) return FALLBACK;
  if (item.color) return item.color;
  if (item.kind === "page") return PAGE_ACCENT[String(item.key).replace(/^page:/, "")] ?? FALLBACK;
  return SOURCE_ACCENT[item.source] ?? KIND_ACCENT[item.kind] ?? FALLBACK;
}

// Glass tile: translucent tint of the accent with a soft border and highlight.
export function glassTileStyle(accent) {
  return {
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 30%, transparent), color-mix(in srgb, ${accent} 10%, transparent))`,
    border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
    boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.4), 0 6px 14px -8px color-mix(in srgb, ${accent} 70%, transparent)`,
    backdropFilter: "blur(6px)",
    color: accent,
  };
}
