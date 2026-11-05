// Map pin as SVG: a teardrop in the type's color with its lucide icon on a
// white disc. `iconNode` is lucide's node list ([[tag, attrs], ...], from
// getIconNode). Colors that are not plain hex fall back so a stored value can
// never inject markup.
export const DEFAULT_PIN_COLOR = '#475569'
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export const pinColor = (color) => (HEX.test(String(color ?? '').trim()) ? String(color).trim() : DEFAULT_PIN_COLOR)
// Stored icon names may be lucide kebab ("hard-drive") or older PascalCase ("HardDrive").
export const iconKey = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase()

function iconMarkup(iconNode, color) {
  if (!Array.isArray(iconNode)) return `<circle cx="20" cy="19" r="4" fill="${color}"/>`
  const children = iconNode.map(([tag, attrs]) => {
    if (!/^[a-z]+$/i.test(tag)) return ''
    const rendered = Object.entries(attrs ?? {}).filter(([k]) => k !== 'key' && /^[a-z-]+$/i.test(k)).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')
    return `<${tag} ${rendered}/>`
  }).join('')
  return `<g transform="translate(11 10) scale(0.75)" fill="none" stroke="${color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${children}</g>`
}

// 40x50 viewBox drawn at 2x for crisp pins (addImage with pixelRatio: 2).
export function pinSvg({ color, iconNode }) {
  const fill = pinColor(color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 40 50">`
    + `<path d="M20 2C10.6 2 3 9.6 3 19c0 12.5 17 29 17 29s17-16.5 17-29C37 9.6 29.4 2 20 2z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>`
    + `<circle cx="20" cy="19" r="12" fill="#ffffff"/>`
    + iconMarkup(iconNode, fill)
    + `</svg>`
}

export function loadPinImage(spec) {
  const img = new Image(80, 100)
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(spec))}`
  return img.decode().then(() => img)
}
