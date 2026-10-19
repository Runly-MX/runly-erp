// Preset looks for the image editor. Each preset is a set of CSS-filter
// parameters; `amount` (0-100) blends from neutral to the full preset, so the
// same look can be applied lightly. Pure functions, shared by the live preview,
// the thumbnails and the export.

const NEUTRAL = Object.freeze({ brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0 });

// `tint` ({ rgb, alpha, mode }) lays a colour over the photo with a blend mode,
// which is what gives the cool / warm / vintage looks their cast (CSS filters alone
// cannot tint). Looks are deliberately strong: the intensity slider tones them down.
export const FILTER_PRESETS = Object.freeze([
  { id: "none", label: "Original", params: {} },
  { id: "vivid", label: "Vívido", params: { contrast: 1.28, saturate: 2.0, brightness: 1.05 } },
  { id: "warm", label: "Cálido", params: { saturate: 1.3, brightness: 1.06, contrast: 1.05 }, tint: { rgb: "255,140,40", alpha: 0.42, mode: "soft-light" } },
  { id: "cool", label: "Frío", params: { saturate: 1.1, brightness: 1.02, contrast: 1.08 }, tint: { rgb: "40,120,255", alpha: 0.45, mode: "soft-light" } },
  { id: "bw", label: "B/N", params: { grayscale: 1, contrast: 1.25 } },
  { id: "noir", label: "Noir", params: { grayscale: 1, contrast: 1.7, brightness: 0.82 } },
  { id: "sepia", label: "Sepia", params: { sepia: 1, contrast: 1.08 } },
  { id: "vintage", label: "Vintage", params: { sepia: 0.5, contrast: 0.88, saturate: 0.8, brightness: 1.06 }, tint: { rgb: "255,170,90", alpha: 0.3, mode: "soft-light" } },
  { id: "fade", label: "Desvanecido", params: { contrast: 0.72, brightness: 1.18, saturate: 0.65 }, tint: { rgb: "200,210,235", alpha: 0.22, mode: "screen" } },
  { id: "dramatic", label: "Dramático", params: { contrast: 1.65, saturate: 1.3, brightness: 0.84 } },
]);

export const NO_FILTER = Object.freeze({ id: "none", amount: 100 });

export function presetById(id) {
  return FILTER_PRESETS.find((p) => p.id === id) ?? FILTER_PRESETS[0];
}

// Numeric filter values of a preset at the given amount (null for the original).
export function presetValues(filter) {
  if (!filter || filter.id === "none") return null;
  const preset = presetById(filter.id);
  const t = Math.max(0, Math.min(100, filter.amount ?? 100)) / 100;
  const v = {};
  for (const key of Object.keys(NEUTRAL)) {
    const target = preset.params[key] ?? NEUTRAL[key];
    v[key] = NEUTRAL[key] + (target - NEUTRAL[key]) * t;
  }
  return v;
}

// CSS `filter` string for a preset at the given amount ("" when neutral).
export function presetFilter(filter) {
  const v = presetValues(filter);
  if (!v) return "";
  return `brightness(${v.brightness}) contrast(${v.contrast}) saturate(${v.saturate}) sepia(${v.sepia}) grayscale(${v.grayscale}) hue-rotate(${v.hue}deg)`;
}

// Colour cast of a preset at the given amount ({ rgb, alpha, mode }), or null.
export function presetTint(filter) {
  if (!filter || filter.id === "none") return null;
  const tint = presetById(filter.id).tint;
  if (!tint) return null;
  const t = Math.max(0, Math.min(100, filter.amount ?? 100)) / 100;
  return { ...tint, alpha: tint.alpha * t };
}
