import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveBrandVars } from '../brandTheme.js'

function luminance(css) {
  const hex = css.startsWith('#') ? css.slice(1) : null
  let rgb
  if (hex) rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  else {
    const [h, s, l] = css.match(/[\d.]+/g).map(Number)
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
    const f = (n) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
    rgb = [f(0), f(8), f(4)].map((c) => Math.round(c * 255))
  }
  const lin = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

test('strict modules get a foreground that passes AA; others keep their look', () => {
  const catalog = deriveBrandVars('#F97316', { strictContrast: true })
  assert.equal(catalog['--brand-primary-foreground'], '#111827')
  assert.ok(ratio('#F97316', catalog['--brand-primary-foreground']) >= 4.5)
  assert.equal(deriveBrandVars('#F97316')['--brand-primary-foreground'], '#ffffff', 'non opted-in modules unchanged')
  assert.equal(deriveBrandVars('#0A7BFF', { strictContrast: true })['--brand-primary-foreground'], '#ffffff', 'dark must pass AA to replace white')
})

test('accent text derived for light surfaces reaches 4.5:1 on white', () => {
  for (const color of ['#F97316', '#008C8C', '#10B981', '#0A7BFF']) {
    assert.ok(ratio(deriveBrandVars(color)['--brand-primary-text'], '#ffffff') >= 4.5, color)
  }
})

test('strict POS teal gets a darker fill that carries white text at AA', () => {
  const pos = deriveBrandVars('#008C8C', { strictContrast: true })
  assert.notEqual(pos['--brand-primary'], '#008c8c')
  assert.equal(pos['--brand-primary-foreground'], '#ffffff')
  assert.ok(ratio(pos['--brand-primary'], '#ffffff') >= 4.5, pos['--brand-primary'])
  assert.equal(deriveBrandVars('#008C8C')['--brand-primary'], '#008c8c', 'non opted-in keeps the official color')
})
