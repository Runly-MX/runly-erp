// Preset looks for the image editor. Each preset is a set of CSS-filter
// parameters; `amount` (0-100) blends from neutral to the full preset, so the
// same look can be applied lightly. Pure functions, shared by the live preview,
// the thumbnails and the export.

const NEUTRAL = Object.freeze({ brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0 });

export const FILTER_GROUPS = Object.freeze([
  { id: "basic", label: "Básicos" },
  { id: "color", label: "Colores" },
  { id: "tone", label: "Tonos" },
  { id: "art", label: "Artísticos" },
  { id: "fx", label: "Efectos" },
]);

// `tint` ({ rgb, alpha, mode }) lays a colour over the photo with a blend mode,
// which is what gives the cool / warm / vintage looks their cast (CSS filters alone
// cannot tint). `effect` names a pixel effect of lib/imageEffects.js (duotone,
// cartoon, oil...). Looks are deliberately strong: the intensity slider tones them down.
const tint = (rgb, alpha, mode = "soft-light") => ({ rgb, alpha, mode });
const duo = (dark, light) => ({ id: "duotone", dark, light });

export const FILTER_PRESETS = Object.freeze([
  { id: "none", group: "basic", label: "Original", params: {} },
  { id: "vivid", group: "basic", label: "Vívido", params: { contrast: 1.28, saturate: 2.0, brightness: 1.05 } },
  { id: "warm", group: "basic", label: "Cálido", params: { saturate: 1.3, brightness: 1.06, contrast: 1.05 }, tint: tint("255,140,40", 0.42) },
  { id: "cool", group: "basic", label: "Frío", params: { saturate: 1.1, brightness: 1.02, contrast: 1.08 }, tint: tint("40,120,255", 0.45) },
  { id: "bw", group: "basic", label: "B/N", params: { grayscale: 1, contrast: 1.25 } },
  { id: "noir", group: "basic", label: "Noir", params: { grayscale: 1, contrast: 1.7, brightness: 0.82 } },
  { id: "sepia", group: "basic", label: "Sepia", params: { sepia: 1, contrast: 1.08 } },
  { id: "vintage", group: "basic", label: "Vintage", params: { sepia: 0.5, contrast: 0.88, saturate: 0.8, brightness: 1.06 }, tint: tint("255,170,90", 0.3) },
  { id: "fade", group: "basic", label: "Desvanecido", params: { contrast: 0.72, brightness: 1.18, saturate: 0.65 }, tint: tint("200,210,235", 0.22, "screen") },
  { id: "dramatic", group: "basic", label: "Dramático", params: { contrast: 1.65, saturate: 1.3, brightness: 0.84 } },

  { id: "golden", group: "color", label: "Hora dorada", params: { saturate: 1.25, brightness: 1.06, contrast: 1.05 }, tint: tint("255,175,60", 0.5) },
  { id: "sunset", group: "color", label: "Atardecer", params: { saturate: 1.3, contrast: 1.08 }, tint: tint("255,85,70", 0.5) },
  { id: "rose", group: "color", label: "Rosa", params: { saturate: 1.15, brightness: 1.05 }, tint: tint("255,115,185", 0.5) },
  { id: "lavender", group: "color", label: "Lavanda", params: { saturate: 1.1, brightness: 1.04 }, tint: tint("165,125,255", 0.5) },
  { id: "ocean", group: "color", label: "Océano", params: { saturate: 1.2, contrast: 1.06 }, tint: tint("15,165,205", 0.55) },
  { id: "mint", group: "color", label: "Menta", params: { saturate: 1.1, brightness: 1.06 }, tint: tint("60,225,170", 0.48) },
  { id: "forest", group: "color", label: "Bosque", params: { saturate: 1.15, contrast: 1.08, brightness: 0.96 }, tint: tint("35,160,75", 0.5) },
  { id: "winter", group: "color", label: "Invierno", params: { saturate: 0.85, brightness: 1.08, contrast: 1.05 }, tint: tint("150,195,255", 0.5, "screen") },
  { id: "summer", group: "color", label: "Verano", params: { saturate: 1.35, brightness: 1.05 }, tint: tint("255,210,70", 0.45) },
  { id: "cinema", group: "color", label: "Cine", params: { contrast: 1.2, saturate: 1.1, brightness: 0.96 }, tint: tint("0,140,155", 0.45) },
  { id: "jungle", group: "color", label: "Jungla", params: { hue: 70, saturate: 1.25 } },
  { id: "ice", group: "color", label: "Hielo", params: { hue: 170, saturate: 1.1, brightness: 1.05 } },
  { id: "neonpink", group: "color", label: "Neón rosa", params: { hue: 300, saturate: 1.6, contrast: 1.15 } },
  { id: "acid", group: "color", label: "Ácido", params: { hue: 120, saturate: 1.7, contrast: 1.2 } },

  { id: "matte", group: "tone", label: "Mate", params: { contrast: 0.85, brightness: 1.05, saturate: 0.8 }, tint: tint("100,100,125", 0.25, "screen") },
  { id: "polaroid", group: "tone", label: "Polaroid", params: { sepia: 0.25, contrast: 0.92, brightness: 1.1, saturate: 1.1 }, tint: tint("255,205,150", 0.3) },
  { id: "lomo", group: "tone", label: "Lomo", params: { contrast: 1.4, saturate: 1.45, brightness: 0.95 } },
  { id: "punch", group: "tone", label: "Intenso", params: { contrast: 1.35, saturate: 1.6 } },
  { id: "silver", group: "tone", label: "Plata", params: { grayscale: 1, contrast: 1.1, brightness: 1.12 } },
  { id: "graphite", group: "tone", label: "Grafito", params: { grayscale: 1, contrast: 0.9, brightness: 0.95 } },
  { id: "cyanotype", group: "tone", label: "Cianotipo", params: { grayscale: 1, contrast: 1.15 }, tint: tint("30,90,200", 0.8, "color") },
  { id: "cross", group: "tone", label: "Proceso cruzado", params: { contrast: 1.3, saturate: 1.3 }, tint: tint("60,230,150", 0.35) },

  { id: "duo-violet", group: "art", label: "Duotono violeta", params: {}, effect: duo("#1b0b4d", "#ff8ad4") },
  { id: "duo-blue", group: "art", label: "Duotono azul", params: {}, effect: duo("#071a52", "#7fe3ff") },
  { id: "duo-amber", group: "art", label: "Duotono ámbar", params: {}, effect: duo("#2b0a00", "#ffd37a") },
  { id: "duo-green", group: "art", label: "Duotono verde", params: {}, effect: duo("#04291d", "#bbff9c") },
  { id: "poster", group: "art", label: "Cartel", params: { contrast: 1.15, saturate: 1.3 }, effect: { id: "posterize", levels: 4 } },
  { id: "popart", group: "art", label: "Pop art", params: { contrast: 1.3, saturate: 2.2 }, effect: { id: "posterize", levels: 3 } },
  { id: "cartoon", group: "art", label: "Caricatura", params: { saturate: 1.3 }, effect: { id: "cartoon", levels: 6 } },
  { id: "pencil", group: "art", label: "Lápiz", params: {}, effect: { id: "pencil", gain: 1.6 } },
  { id: "charcoal", group: "art", label: "Carboncillo", params: { contrast: 1.2 }, effect: { id: "pencil", gain: 2.6 } },
  { id: "oil", group: "art", label: "Óleo", params: { saturate: 1.2, contrast: 1.05 }, effect: { id: "oil", radius: 1.4 } },
  { id: "watercolor", group: "art", label: "Acuarela", params: { saturate: 1.1, brightness: 1.04 }, effect: { id: "watercolor", levels: 9 } },
  { id: "mosaic", group: "art", label: "Mosaico", params: {}, effect: { id: "mosaic", block: 18 } },
  { id: "halftone", group: "art", label: "Semitono", params: { contrast: 1.15 }, effect: { id: "halftone", cell: 11 } },
  { id: "comic", group: "art", label: "Cómic", params: { contrast: 1.2, saturate: 1.5 }, effect: { id: "halftone", cell: 7, paper: "#fff6dc" } },

  { id: "pixel", group: "fx", label: "Pixel art", params: { saturate: 1.2 }, effect: { id: "mosaic", block: 7, levels: 6 } },
  { id: "glitch", group: "fx", label: "Glitch", params: { contrast: 1.1, saturate: 1.2 }, effect: { id: "glitch", shift: 9 } },
  { id: "emboss", group: "fx", label: "Relieve", params: {}, effect: { id: "emboss" } },
  { id: "neon", group: "fx", label: "Neón", params: {}, effect: { id: "neon" } },
  { id: "thermal", group: "fx", label: "Térmico", params: {}, effect: { id: "thermal" } },
  { id: "film", group: "fx", label: "Película", params: { sepia: 0.2, contrast: 1.12, saturate: 0.9 }, tint: tint("255,190,130", 0.18), effect: { id: "grain", amount: 40 } },
  { id: "grain", group: "fx", label: "Grano", params: { grayscale: 1, contrast: 1.2 }, effect: { id: "grain", amount: 55 } },
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

// Pixel effect of a preset ({ effect, amount }), or null.
export function presetEffect(filter) {
  if (!filter || filter.id === "none") return null;
  const effect = presetById(filter.id).effect;
  return effect ? { effect, amount: Math.max(0, Math.min(100, filter.amount ?? 100)) } : null;
}
