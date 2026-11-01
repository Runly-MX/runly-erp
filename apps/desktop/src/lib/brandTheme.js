function hexToRgb(hex) {
  const clean = String(hex || "")
    .trim()
    .replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round((h * 60 + 360) % 360);

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function adjustLightness(hsl, amount) {
  return {
    ...hsl,
    l: clamp(hsl.l + amount, 0, 100),
  };
}

function hslToCss(hsl) {
  return `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`;
}

function srgbLinearize(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return (
    0.2126 * srgbLinearize(r) +
    0.7152 * srgbLinearize(g) +
    0.0722 * srgbLinearize(b)
  );
}

// Picks white or dark text based on the perceived darkness of the color.
//
// Two-path decision:
//   Saturated colors (S ≥ 30): use HSL lightness with a 65% threshold.
//     Vibrant mid-tones like cyan, emerald, blue feel visually darker than
//     their WCAG luminance suggests, so the HSL axis is more accurate here.
//     L < 65  → white text  (covers all Atlas module colors)
//     L ≥ 65  → dark text   (pale tints like sky-200, rose-100, etc.)
//
//   Neutral / low-saturation (S < 30): use WCAG relative luminance.
//     Grays and near-grays have no hue bias, so luminance is the right axis.
//     Crossover at ≈ 0.179 (equal contrast point between white and black).
//
//   Either path: dark text is only kept when white would fail WCAG AA. Light
//   violets/pinks (e.g. #8b5cf6, L 66%) crossed the HSL threshold and got
//   #111827 at 3.9:1 while white reaches 4.6:1.
//
//   strict (opt-in per module): when white fails AA and dark text passes,
//   dark wins. An orange like #F97316 (L 53%) takes white at 2.8:1 while
//   #111827 reaches 6.3:1. Modules join AA_FOREGROUND_MODULES once their
//   screens pass a contrast review, so the rest keep their current look.
const DARK_TEXT = { r: 17, g: 24, b: 39 };

export const AA_FOREGROUND_MODULES = new Set(["runly.catalog"]);

function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function pickForeground({ r, g, b }, { strict = false } = {}) {
  const { s, l } = rgbToHsl({ r, g, b });
  const L = relativeLuminance({ r, g, b });
  const whitePassesAA = 1.05 / (L + 0.05) >= 4.5;
  if (strict && !whitePassesAA && contrastRatio({ r, g, b }, DARK_TEXT) >= 4.5) return "#111827";
  if (s >= 30) {
    return l < 65 || whitePassesAA ? "#ffffff" : "#111827";
  }
  return L <= 0.179 || whitePassesAA ? "#ffffff" : "#111827";
}

function hslToRgb({ h, s, l }) {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

// Accent for text and icons on light surfaces: the module color darkened
// until it reaches 5.5:1 on white, so it still clears 4.5:1 on the tinted
// (--brand-soft) and muted surfaces it sits on (official colors such as #F97316 or
// #008C8C stay for fills and indicators). Dark surfaces keep
// --brand-primary-on-dark.
function textOnLight(hsl) {
  const white = { r: 255, g: 255, b: 255 };
  let candidate = { ...hsl };
  while (candidate.l > 0 && contrastRatio(hslToRgb(candidate), white) < 5.5) {
    candidate = adjustLightness(candidate, -1);
  }
  return hslToCss(candidate);
}

// The same derived tokens applyBrandTheme writes on :root, as a plain object -
// for scopes (the chat's per-user accent) that restyle a subtree only.
export function deriveBrandVars(primaryColor, { strictContrast = false } = {}) {
  const rgb = hexToRgb(primaryColor);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  const darkHsl = { ...hsl, l: Math.max(hsl.l, 55) };
  return {
    "--brand-primary": `#${((rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).padStart(6, "0")}`,
    "--brand-primary-on-dark": hslToCss(darkHsl),
    "--brand-primary-hover": hslToCss(adjustLightness(hsl, -8)),
    "--brand-primary-foreground": pickForeground(rgb, { strict: strictContrast }),
    "--brand-primary-text": textOnLight(hsl),
    "--ring": `${hsl.h} ${hsl.s}% ${hsl.l}%`,
    "--glass-tint": `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`,
  };
}

export function applyBrandTheme(primaryColor, { strictContrast = false } = {}) {
  const root = document.documentElement;
  const rgb = hexToRgb(primaryColor || "#0A7BFF") || hexToRgb("#0A7BFF");
  const hsl = rgbToHsl(rgb);
  const hover = adjustLightness(hsl, -8);

  // Dark-mode-safe variant: guarantee minimum lightness so the primary color
  // stays visible against dark backgrounds regardless of the module's color.
  const DARK_MIN_L = 55;
  const darkHsl = { ...hsl, l: Math.max(hsl.l, DARK_MIN_L) };

  root.style.setProperty(
    "--brand-primary",
    `#${((rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).padStart(6, "0")}`,
  );
  root.style.setProperty("--brand-primary-on-dark", hslToCss(darkHsl));
  root.style.setProperty("--brand-primary-hover", hslToCss(hover));
  root.style.setProperty("--brand-primary-foreground", pickForeground(rgb, { strict: strictContrast }));
  root.style.setProperty("--brand-primary-text", textOnLight(hsl));
  root.style.setProperty("--ring", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
  root.style.setProperty(
    "--glass-tint",
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`,
  );
  root.style.setProperty(
    "--glass-glow",
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`,
  );
  root.style.setProperty(
    "--brand-soft",
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`,
  );
}
