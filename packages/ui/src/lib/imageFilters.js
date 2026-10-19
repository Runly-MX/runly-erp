// Preset looks for the image editor. Each preset is a set of CSS-filter
// parameters; `amount` (0-100) blends from neutral to the full preset, so the
// same look can be applied lightly. Pure functions, shared by the live preview,
// the thumbnails and the export.

const NEUTRAL = Object.freeze({ brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0 });

export const FILTER_PRESETS = Object.freeze([
  { id: "none", label: "Original", params: {} },
  { id: "vivid", label: "Vívido", params: { contrast: 1.12, saturate: 1.4, brightness: 1.03 } },
  { id: "warm", label: "Cálido", params: { sepia: 0.25, saturate: 1.15, brightness: 1.04, hue: -8 } },
  { id: "cool", label: "Frío", params: { saturate: 1.05, hue: 14, contrast: 1.05 } },
  { id: "bw", label: "B/N", params: { grayscale: 1, contrast: 1.1 } },
  { id: "noir", label: "Noir", params: { grayscale: 1, contrast: 1.4, brightness: 0.9 } },
  { id: "sepia", label: "Sepia", params: { sepia: 0.85, contrast: 1.05 } },
  { id: "vintage", label: "Vintage", params: { sepia: 0.35, contrast: 0.9, saturate: 0.85, brightness: 1.05 } },
  { id: "fade", label: "Desvanecido", params: { contrast: 0.85, brightness: 1.08, saturate: 0.8 } },
  { id: "dramatic", label: "Dramático", params: { contrast: 1.35, saturate: 1.1, brightness: 0.92 } },
]);

export const NO_FILTER = Object.freeze({ id: "none", amount: 100 });

export function presetById(id) {
  return FILTER_PRESETS.find((p) => p.id === id) ?? FILTER_PRESETS[0];
}

// CSS `filter` string for a preset at the given amount ("" when neutral).
export function presetFilter(filter) {
  if (!filter || filter.id === "none") return "";
  const preset = presetById(filter.id);
  const t = Math.max(0, Math.min(100, filter.amount ?? 100)) / 100;
  const v = {};
  for (const key of Object.keys(NEUTRAL)) {
    const target = preset.params[key] ?? NEUTRAL[key];
    v[key] = NEUTRAL[key] + (target - NEUTRAL[key]) * t;
  }
  return `brightness(${v.brightness}) contrast(${v.contrast}) saturate(${v.saturate}) sepia(${v.sepia}) grayscale(${v.grayscale}) hue-rotate(${v.hue}deg)`;
}
