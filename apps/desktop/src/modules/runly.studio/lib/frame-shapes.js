// Frame presets for Studio photos. Every preset only sets canonical image
// properties the engine renders (mask, radius, border, shadow); framing
// (offset, zoom, crop) is never touched by choosing a frame.
const NO_BORDER = { width: 0, color: '#000000' }
const NO_SHADOW = { blur: 0, offsetX: 0, offsetY: 0, color: '#000000' }
const SOFT_SHADOW = { blur: 32, offsetX: 0, offsetY: 14, color: '#64748b' }

const frame = (key, label, mask, extra = {}) => ({ key, label, mask, radius: extra.radius ?? 24, border: extra.border ?? NO_BORDER, shadow: extra.shadow ?? NO_SHADOW })

export const FRAME_GROUPS = Object.freeze([
  { key: 'basic', label: 'Básicos', frames: [
    frame('plain', 'Sin marco', 'rectangle'),
    frame('outline', 'Contorno', 'rectangle', { border: { width: 10, color: '#0f172a' } }),
    frame('instant', 'Instantánea', 'rectangle', { border: { width: 28, color: '#ffffff' }, shadow: SOFT_SHADOW }),
    frame('lifted', 'Elevada', 'rectangle', { shadow: SOFT_SHADOW }),
  ] },
  { key: 'geometric', label: 'Geométricos', frames: [
    frame('circle', 'Círculo', 'circle'),
    frame('ellipse', 'Óvalo', 'ellipse'),
    frame('triangle', 'Triángulo', 'triangle'),
    frame('star', 'Estrella', 'star'),
  ] },
  { key: 'creative', label: 'Creativos', frames: [
    frame('arch', 'Arco', 'arch'),
    frame('arch-line', 'Arco con línea', 'arch', { border: { width: 10, color: '#ffffff' }, shadow: SOFT_SHADOW }),
    frame('ring', 'Anillo', 'circle', { border: { width: 14, color: '#d946ef' } }),
    frame('star-glow', 'Estrella brillante', 'star', { border: { width: 8, color: '#facc15' } }),
  ] },
  { key: 'rounded', label: 'Redondeados', frames: [
    frame('soft', 'Suave', 'rounded', { radius: 24 }),
    frame('round', 'Redondo', 'rounded', { radius: 64 }),
    frame('pill', 'Píldora', 'rounded', { radius: 400 }),
    frame('card', 'Tarjeta', 'rounded', { radius: 40, border: { width: 12, color: '#ffffff' }, shadow: SOFT_SHADOW }),
  ] },
])

export const FRAMES = FRAME_GROUPS.flatMap(group => group.frames)

export function framePatch(preset) {
  return { mask: preset.mask, radius: preset.radius, border: preset.border, shadow: preset.shadow }
}

// The preset that matches the current image properties, if any.
export function activeFrame(image) {
  if (!image) return FRAMES[0]
  return FRAMES.find(preset => preset.mask === image.mask && preset.border.width === image.border?.width
    && preset.shadow.blur === image.shadow?.blur && (preset.mask !== 'rounded' || preset.radius === image.radius)) ?? null
}

// SVG path of a mask in a w × h box, same geometry as studio-photo's canvas mask
// (that one is centred; this one is top-left based).
export function maskPath(mask, w, h, radius = 24) {
  const cx = w / 2, cy = h / 2
  if (mask === 'circle' || mask === 'ellipse') {
    const rx = mask === 'circle' ? Math.min(w, h) / 2 : w / 2, ry = mask === 'circle' ? Math.min(w, h) / 2 : h / 2
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
  }
  if (mask === 'triangle') return `M${cx} 0L${w} ${h}L0 ${h}Z`
  if (mask === 'star') {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 5, k = index % 2 ? 0.45 : 1
      return `${(cx + Math.cos(angle) * cx * k).toFixed(2)} ${(cy + Math.sin(angle) * cy * k).toFixed(2)}`
    })
    return `M${points.join('L')}Z`
  }
  if (mask === 'arch') return `M0 ${h}L0 ${cy}C0 ${cy - h * 2 / 3} ${w} ${cy - h * 2 / 3} ${w} ${cy}L${w} ${h}Z`
  if (mask === 'rounded') {
    const r = Math.min(radius, w / 2, h / 2)
    return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
  }
  return `M0 0H${w}V${h}H0Z`
}

// Filter presets: canonical adjustments only (brightness/contrast/saturation in
// −1…1, blur 0…1, grayscale/sepia). `css` approximates them for previews.
export const FILTER_PRESETS = Object.freeze([
  { key: 'original', label: 'Original', adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false, sepia: false } },
  { key: 'vivid', label: 'Vívido', adjustments: { brightness: 0.04, contrast: 0.15, saturation: 0.45, blur: 0, grayscale: false, sepia: false } },
  { key: 'soft', label: 'Suave', adjustments: { brightness: 0.08, contrast: -0.15, saturation: -0.1, blur: 0, grayscale: false, sepia: false } },
  { key: 'drama', label: 'Dramático', adjustments: { brightness: -0.08, contrast: 0.35, saturation: -0.2, blur: 0, grayscale: false, sepia: false } },
  { key: 'mono', label: 'Blanco y negro', adjustments: { brightness: 0, contrast: 0.05, saturation: 0, blur: 0, grayscale: true, sepia: false } },
  { key: 'noir', label: 'Noir', adjustments: { brightness: -0.05, contrast: 0.4, saturation: 0, blur: 0, grayscale: true, sepia: false } },
  { key: 'vintage', label: 'Vintage', adjustments: { brightness: 0.05, contrast: -0.1, saturation: -0.15, blur: 0, grayscale: false, sepia: true } },
  { key: 'dream', label: 'Ensueño', adjustments: { brightness: 0.1, contrast: -0.1, saturation: 0.1, blur: 0.08, grayscale: false, sepia: false } },
])

export function adjustmentsCss(a = {}) {
  return [`brightness(${1 + (a.brightness ?? 0)})`, `contrast(${1 + (a.contrast ?? 0)})`, `saturate(${1 + (a.saturation ?? 0)})`,
    a.grayscale ? 'grayscale(1)' : '', a.sepia ? 'sepia(1)' : '', a.blur ? `blur(${(a.blur * 6).toFixed(1)}px)` : ''].filter(Boolean).join(' ')
}

export function activeFilter(adjustments) {
  return FILTER_PRESETS.find(preset => Object.entries(preset.adjustments).every(([key, value]) => (adjustments?.[key] ?? (typeof value === 'boolean' ? false : 0)) === value))?.key ?? null
}
