import { packageError } from './errors.js'

// Allowlist SVG sanitizer. Pure, dependency-free, safe on hostile bytes. It does NOT use a general XML
// parser on purpose: DOCTYPE, entities, CDATA, processing instructions and namespaces are rejected, so
// there is no XXE / entity-expansion surface. Output is canonical: sanitizeSvg(output) === output.
export const SVG_LIMITS = Object.freeze({ bytes: 256 * 1024, elements: 5000, depth: 32, side: 8192, attrBytes: 32 * 1024, filters: 16, filterPrimitives: 64, filterSteps: 16, filterBlur: 64, filterOffset: 256, filterRegionScale: 4, filterPixels: 16 * 1024 * 1024 })

const FILTER_ELEMENTS = new Set(['feGaussianBlur', 'feDropShadow', 'feOffset', 'feFlood', 'feBlend', 'feComposite', 'feMerge', 'feMergeNode'])
const ELEMENTS = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'title', 'desc', 'symbol', 'filter', ...FILTER_ELEMENTS])
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc'])
// Active or unsupported constructs: hard reject so a malicious upload is visible, never silently cleaned.
const FORBIDDEN = new Set(['script', 'foreignobject', 'style', 'image', 'a', 'animate', 'animatetransform', 'animatemotion', 'set', 'iframe', 'object', 'embed', 'pattern', 'marker', 'switch', 'feimage', 'html', 'link'])
const FILTER_ATTRS = {
  filter: ['id', 'x', 'y', 'width', 'height', 'filterUnits', 'primitiveUnits', 'color-interpolation-filters'],
  feGaussianBlur: ['in', 'result', 'stdDeviation', 'edgeMode'],
  feDropShadow: ['in', 'result', 'stdDeviation', 'dx', 'dy', 'flood-color', 'flood-opacity'],
  feOffset: ['in', 'result', 'dx', 'dy'],
  feFlood: ['result', 'flood-color', 'flood-opacity'],
  feBlend: ['in', 'in2', 'result', 'mode'],
  feComposite: ['in', 'in2', 'result', 'operator', 'k1', 'k2', 'k3', 'k4'],
  feMerge: ['result'],
  feMergeNode: ['in'],
}
const FILTER_ONLY_ATTRS = new Set(Object.values(FILTER_ATTRS).flat().filter((a) => !['id', 'x', 'y', 'width', 'height', 'dx', 'dy'].includes(a)))
const ATTRS = new Set(['id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'clip-path', 'mask', 'href', 'preserveAspectRatio', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dx', 'dy', 'letter-spacing', 'color', 'display', 'visibility', 'role', 'aria-label', 'aria-hidden', 'mask-type'])
ATTRS.add('filter')
for (const name of FILTER_ONLY_ATTRS) ATTRS.add(name)
const STYLE_PROPS = new Set([...ATTRS].filter((a) => !['id', 'viewBox', 'width', 'height', 'href', 'd', 'points', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'role', 'aria-label', 'aria-hidden', 'preserveAspectRatio', 'offset', 'dx', 'dy'].includes(a)))
const ID = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/
// Any url() must be a local fragment; anything else in a value is data, never a reference.
const SAFE_VALUE = /^(?:[^<>&"'\\]|url\(#[A-Za-z_][A-Za-z0-9_.:-]{0,63}\))*$/
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const fail = (reason, message, details) => packageError(reason, message, { details })
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function decode(raw) {
  return raw.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]+);/g, (_, name) => {
    if (name[0] === '#') { const cp = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); if (cp < 32 && ![9, 10, 13].includes(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw fail('svg_forbidden_content', 'El SVG contiene caracteres no válidos.', ['char-ref']); return String.fromCodePoint(cp) }
    if (!(name in ENTITIES)) throw fail('svg_forbidden_content', 'El SVG usa entidades XML no permitidas.', ['entity'])
    return ENTITIES[name]
  })
}
const noStray = (s) => { if (/[<&]/.test(s.replace(/&(?:#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]+);/g, ''))) throw fail('svg_invalid_xml', 'El SVG no es XML válido.') }

function cleanValue(name, value, tag, warnings) {
  if (value.length > 8192 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw fail('svg_forbidden_content', 'Un atributo del SVG no es válido.', [name])
  if (name === 'href') {
    if (tag !== 'use' || !/^#[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/.test(value)) throw fail('svg_forbidden_content', 'El SVG referencia contenido externo.', ['href'])
    return value
  }
  if (name === 'id') { if (!ID.test(value)) throw fail('svg_forbidden_content', 'Identificador no válido.', ['id']); return value }
  if (/javascript:|vbscript:|data:|expression\s*\(|@import|\bimage\s*\(|url\(\s*(?!#)/i.test(value) || !SAFE_VALUE.test(value)) throw fail('svg_forbidden_content', 'Un valor del SVG contiene una referencia no permitida.', [name])
  return value
}

// Illustrator/Figma exports use style="fill:#fff;..." : convert allowlisted declarations to attributes.
function styleToAttrs(value, attrs, tag, warnings) {
  for (const decl of value.split(';')) {
    const at = decl.indexOf(':')
    if (at < 0) { if (decl.trim()) throw fail('svg_forbidden_content', 'Estilo en línea no válido.', ['style']); continue }
    const name = decl.slice(0, at).trim().toLowerCase(), v = decl.slice(at + 1).trim()
    if (!STYLE_PROPS.has(name)) { warnings.add('style-property-dropped'); continue }
    if (!attrs.has(name)) attrs.set(name, cleanValue(name, v, tag, warnings))
  }
}

function checkFilterAttrs(tag, attrs, state, limits) {
  const number = (value, min, max, name) => {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw fail('svg_forbidden_content', 'Valor de filtro no válido.', [name])
    if (Number(value) < min || Number(value) > max) throw fail('svg_too_complex', 'El filtro supera los límites permitidos.', [name])
    return Number(value)
  }
  const choice = (name, options) => {
    if (attrs.has(name) && !options.includes(attrs.get(name))) throw fail('svg_forbidden_content', 'Opción de filtro no admitida.', [name])
  }
  for (const name of attrs.keys()) if (!FILTER_ATTRS[tag].includes(name)) attrs.delete(name)
  if (tag === 'filter') {
    choice('filterUnits', ['objectBoundingBox', 'userSpaceOnUse'])
    choice('primitiveUnits', ['userSpaceOnUse'])
    choice('color-interpolation-filters', ['sRGB', 'linearRGB'])
    const relative = attrs.get('filterUnits') !== 'userSpaceOnUse'
    const region = (name, fallback) => {
      const raw = attrs.get(name) ?? fallback
      const percent = raw.endsWith('%')
      const value = number(percent ? raw.slice(0, -1) : raw, -limits.side * 100, limits.side * 100, name) / (percent ? 100 : 1)
      const bound = relative || percent ? limits.filterRegionScale : limits.side
      if (Math.abs(value) > bound || (['width', 'height'].includes(name) && value <= 0)) throw fail('svg_too_complex', 'La región del filtro supera los límites permitidos.', [name])
    }
    region('x', '-10%'); region('y', '-10%')
    region('width', '120%'); region('height', '120%')
    return
  }
  for (const name of ['in', 'in2']) if (attrs.has(name) && !['SourceGraphic', 'SourceAlpha'].includes(attrs.get(name)) && !state.results.has(attrs.get(name))) throw fail('svg_forbidden_content', 'El filtro referencia una entrada desconocida o posterior.', [name])
  if (attrs.has('result') && (!ID.test(attrs.get('result')) || ['SourceGraphic', 'SourceAlpha', 'BackgroundImage', 'BackgroundAlpha', 'FillPaint', 'StrokePaint'].includes(attrs.get('result')) || state.results.has(attrs.get('result')))) throw fail('svg_forbidden_content', 'Resultado de filtro no válido o repetido.', ['result'])
  if (attrs.has('stdDeviation')) {
    const values = attrs.get('stdDeviation').trim().split(/[\s,]+/)
    if (values.length < 1 || values.length > 2) throw fail('svg_forbidden_content', 'Desenfoque no válido.', ['stdDeviation'])
    for (const value of values) number(value, 0, limits.filterBlur, 'stdDeviation')
  }
  for (const name of ['dx', 'dy']) if (attrs.has(name)) number(attrs.get(name), -limits.filterOffset, limits.filterOffset, name)
  if (attrs.has('flood-opacity')) number(attrs.get('flood-opacity'), 0, 1, 'flood-opacity')
  if (attrs.has('flood-color') && !/^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,%\s+-]+\))$/i.test(attrs.get('flood-color'))) throw fail('svg_forbidden_content', 'Color de filtro no admitido.', ['flood-color'])
  choice('edgeMode', ['none', 'duplicate'])
  choice('mode', ['normal', 'multiply', 'screen', 'darken', 'lighten'])
  choice('operator', ['over', 'in', 'out', 'atop', 'xor', 'arithmetic'])
  for (const name of ['k1', 'k2', 'k3', 'k4']) if (attrs.has(name)) number(attrs.get(name), -10, 10, name)
}

export function sanitizeSvg(input, limits = SVG_LIMITS) {
  limits = { ...SVG_LIMITS, ...limits }
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? [])
  if (!bytes.length || bytes.length > limits.bytes) throw fail('svg_too_complex', 'El SVG está vacío o supera el tamaño permitido.', ['bytes'])
  let src
  try { src = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw fail('svg_invalid_xml', 'El SVG no es UTF-8 válido.') }
  src = src.replace(/^\uFEFF/, '')
  const warnings = new Set()
  let pos = 0
  const decl = /^\s*<\?xml\s[^<>?]*\?>/.exec(src)
  if (decl) { if (!/^\s*<\?xml\s+version="1\.[01]"(?:\s+encoding="(?:UTF|utf)-8")?(?:\s+standalone="(?:yes|no)")?\s*\?>$/.test(decl[0])) throw fail('svg_forbidden_content', 'Declaración XML no admitida.', ['xml-decl']); pos = decl[0].length }
  const tagRe = /<(\/?)([A-Za-z][A-Za-z0-9:_.-]*)((?:\s+[A-Za-z_:][A-Za-z0-9_:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y
  const attrRe = /([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  const out = [], stack = [], idUse = new Map(), useTargets = [], filterRegions = [], filterIds = new Set(), filterTargets = []
  let root = null, elements = 0, skip = 0, filters = 0, filterPrimitives = 0 // skip: depth inside a namespaced/metadata subtree being dropped
  const emitText = (raw) => {
    if (!raw) return
    noStray(raw)
    if (skip) return
    const top = stack[stack.length - 1]
    if (!raw.trim()) { if (top && TEXT_ELEMENTS.has(top.tag)) out.push(escapeText(decode(raw))); return }
    if (!top || !TEXT_ELEMENTS.has(top.tag)) throw fail('svg_invalid_xml', 'Texto no esperado dentro del SVG.')
    out.push(escapeText(decode(raw)))
  }
  while (pos < src.length) {
    const lt = src.indexOf('<', pos)
    if (lt < 0) { if (src.slice(pos).trim()) throw fail('svg_invalid_xml', 'El SVG no es XML válido.'); break }
    if (lt > pos) { const text = src.slice(pos, lt); if (!root && text.trim()) throw fail('svg_invalid_xml', 'El SVG no es XML válido.'); if (root) emitText(text) }
    pos = lt
    if (src.startsWith('<!--', pos)) { const end = src.indexOf('-->', pos + 4); if (end < 0) throw fail('svg_invalid_xml', 'Comentario sin cerrar.'); pos = end + 3; continue }
    if (/^<![A-Za-z]|^<!\[CDATA\[|^<\?/.test(src.slice(pos, pos + 9))) throw fail('svg_forbidden_content', 'El SVG contiene DOCTYPE, entidades, CDATA o instrucciones de proceso.', ['markup-declaration'])
    tagRe.lastIndex = pos
    const m = tagRe.exec(src)
    if (!m) throw fail('svg_invalid_xml', 'El SVG no es XML válido.')
    pos = tagRe.lastIndex
    const [, closing, rawTag, rawAttrs, selfClose] = m
    if (closing && (rawAttrs.trim() || selfClose)) throw fail('svg_invalid_xml', 'Etiqueta de cierre no válida.')
    const lower = rawTag.toLowerCase()
    if (rawTag.includes(':')) { // namespaced editor metadata (inkscape:, sodipodi:, rdf:, dc:...) is safe to drop
      if (!closing) { if (!selfClose) { skip++; stack.push({ tag: rawTag, dropped: true }) } warnings.add('metadata-dropped') } else { const top = stack.pop(); if (!top || top.tag !== rawTag) throw fail('svg_invalid_xml', 'Etiquetas mal anidadas.'); skip-- }
      continue
    }
    if (skip && !closing) { if (!selfClose) { skip++; stack.push({ tag: rawTag, dropped: true }) } continue }
    if (skip && closing) { const top = stack.pop(); if (!top || top.tag !== rawTag) throw fail('svg_invalid_xml', 'Etiquetas mal anidadas.'); skip--; continue }
    if (FORBIDDEN.has(lower)) throw fail('svg_forbidden_content', 'El SVG contiene contenido activo o no soportado.', [lower])
    if (lower === 'metadata' || lower === 'sodipodi') { if (!closing && !selfClose) { skip++; stack.push({ tag: rawTag, dropped: true }) } if (closing) throw fail('svg_invalid_xml', 'Etiquetas mal anidadas.'); warnings.add('metadata-dropped'); continue }
    if (!ELEMENTS.has(rawTag)) throw fail('svg_forbidden_content', 'El SVG usa un elemento no permitido.', [lower])
    if (closing) {
      const top = stack.pop()
      if (!top || top.tag !== rawTag) throw fail('svg_invalid_xml', 'Etiquetas mal anidadas.')
      if (top.id) idUse.set(top.id, top.hasUse)
      if (top.result) top.filterState.results.add(top.result)
      out.push(`</${rawTag}>`)
      continue
    }
    if (!root) { if (rawTag !== 'svg') throw fail('svg_invalid_xml', 'El elemento raíz debe ser <svg>.'); root = true } else if (!stack.length) throw fail('svg_invalid_xml', 'El SVG tiene más de un elemento raíz.')
    if (++elements > limits.elements) throw fail('svg_too_complex', 'El SVG tiene demasiados elementos.', ['elements'])
    if (stack.length >= limits.depth) throw fail('svg_too_complex', 'El SVG está anidado a demasiada profundidad.', ['depth'])
    const parent = stack[stack.length - 1]
    let filterState = stack.find((frame) => frame.tag === 'filter')?.filterState
    if (rawTag === 'filter') {
      if (filterState || parent?.tag !== 'defs') throw fail('svg_forbidden_content', 'Los filtros deben declararse dentro de defs, sin anidarse.', ['filter'])
      if (++filters > limits.filters) throw fail('svg_too_complex', 'Demasiados filtros SVG.', ['filters'])
      filterState = { steps: 0, results: new Set() }
    } else if (FILTER_ELEMENTS.has(rawTag)) {
      if (!filterState || (rawTag === 'feMergeNode' ? parent?.tag !== 'feMerge' : parent?.tag !== 'filter')) throw fail('svg_forbidden_content', 'Primitiva de filtro fuera de contexto.', [rawTag])
      if (++filterPrimitives > limits.filterPrimitives || ++filterState.steps > limits.filterSteps) throw fail('svg_too_complex', 'Demasiadas operaciones de filtro.', ['filter-primitives'])
    } else if (filterState) throw fail('svg_forbidden_content', 'Elemento no admitido dentro de un filtro.', [rawTag])
    const attrs = new Map(), seen = new Set(), pending = []
    let styleValue = null
    for (const a of rawAttrs.matchAll(attrRe)) {
      const name = a[1], value = decode(a[2] ?? a[3] ?? '')
      if (seen.has(name)) throw fail('svg_invalid_xml', 'Atributo repetido.')
      seen.add(name)
      if (/^on/i.test(name)) throw fail('svg_forbidden_content', 'El SVG contiene manejadores de eventos.', ['event-handler'])
      if (name === 'xmlns') { if (value !== 'http://www.w3.org/2000/svg') throw fail('svg_forbidden_content', 'Espacio de nombres no admitido.', ['xmlns']); continue }
      if (name === 'xlink:href') { pending.push(['href', value]); continue }
      if (name === 'style') { styleValue = value; continue }
      if (name === 'version' || name === 'xml:space' || name === 'xmlns:xlink') continue
      if (name.includes(':')) { if (/^xmlns:/.test(name) && /javascript|data:/i.test(value)) throw fail('svg_forbidden_content', 'Espacio de nombres no admitido.', ['xmlns']); warnings.add('attribute-dropped'); continue }
      if (!ATTRS.has(name)) { warnings.add('attribute-dropped'); continue }
      pending.push([name, value])
    }
    for (const [name, value] of pending) { if (name === 'href' && attrs.has('href')) throw fail('svg_invalid_xml', 'Atributo repetido.'); attrs.set(name, cleanValue(name, value, lower, warnings)) }
    if (styleValue !== null) styleToAttrs(styleValue, attrs, lower, warnings)
    if (FILTER_ATTRS[rawTag]) {
      checkFilterAttrs(rawTag, attrs, filterState, limits)
      if (rawTag === 'filter') { filterRegions.push(new Map(attrs)); if (attrs.has('id')) filterIds.add(attrs.get('id')) }
    } else {
      for (const name of FILTER_ONLY_ATTRS) attrs.delete(name)
      if (attrs.has('filter') && attrs.get('filter') !== 'none') {
        const target = /^url\(#([A-Za-z_][A-Za-z0-9_.:-]{0,63})\)$/.exec(attrs.get('filter'))
        if (!target || !['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'use'].includes(rawTag)) throw fail('svg_forbidden_content', 'Referencia de filtro no admitida.', ['filter'])
        if (filterTargets.push(target[1]) > limits.filters) throw fail('svg_too_complex', 'Demasiadas aplicaciones de filtros.', ['filter-uses'])
      }
    }
    if (rawTag === 'svg') {
      const vb = /^\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*$/.exec(attrs.get('viewBox') ?? '')
      if (!vb || !(Number(vb[3]) > 0) || !(Number(vb[4]) > 0) || vb.slice(1).some((n) => !Number.isFinite(Number(n)))) throw fail('svg_no_viewbox', 'El SVG necesita un viewBox válido (por ejemplo "0 0 24 24").')
      attrs.set('xmlns', 'http://www.w3.org/2000/svg')
      // The viewBox is the only size authority; fixed width/height would fight responsive layout.
      attrs.delete('width'); attrs.delete('height')
    }
    const sorted = [...attrs].sort(([a], [b]) => (a === 'xmlns' ? -1 : b === 'xmlns' ? 1 : a < b ? -1 : a > b ? 1 : 0))
    if (lower === 'use') { useTargets.push(attrs.get('href')); for (const a of stack) a.hasUse = true }
    if (selfClose && attrs.has('id')) idUse.set(attrs.get('id'), lower === 'use')
    out.push(`<${rawTag}${sorted.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')}${selfClose ? '/>' : '>'}`)
    if (selfClose && attrs.has('result')) filterState.results.add(attrs.get('result'))
    if (!selfClose) stack.push({ tag: rawTag, id: attrs.get('id'), hasUse: lower === 'use', filterState, result: attrs.get('result') })
  }
  if (!root || stack.length) throw fail('svg_invalid_xml', 'El SVG no es XML válido.')
  // A <use> may not reach another <use> (or itself through an ancestor): that is how exponential expansion bombs are built.
  for (const target of useTargets) if (!target || idUse.get(target.slice(1))) throw fail('svg_too_complex', 'El SVG anida referencias <use>.', ['use'])
  const svg = out.join('')
  // Local references must resolve (a dangling url(#x)/use is a broken asset, not a security issue).
  const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((r) => r[1]))
  for (const r of svg.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) if (!ids.has(r[1])) { warnings.add('dangling-reference'); break }
  const vb = /viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg)
  const width = Math.max(1, Math.round(Number(vb[3]))), height = Math.max(1, Math.round(Number(vb[4])))
  if (width > limits.side || height > limits.side) throw fail('svg_too_complex', 'El viewBox del SVG supera el tamaño permitido.', ['viewBox'])
  for (const target of filterTargets) if (!filterIds.has(target)) throw fail('svg_forbidden_content', 'El filtro no existe en el SVG.', ['filter'])
  for (const region of filterRegions) {
    const relative = region.get('filterUnits') !== 'userSpaceOnUse'
    const size = (name, side) => {
      const value = region.get(name) ?? '120%'
      return value.endsWith('%') ? Number(value.slice(0, -1)) / 100 * side : Number(value) * (relative ? side : 1)
    }
    if (size('width', width) * size('height', height) > limits.filterPixels) throw fail('svg_too_complex', 'La región del filtro tiene demasiados píxeles.', ['filter-region'])
  }
  const data = Buffer.from(svg, 'utf8')
  return { data, width, height, viewBox: `${vb[1]} ${vb[2]} ${vb[3]} ${vb[4]}`, recolorable: /(?:fill|stroke)="currentColor"/.test(svg), warnings: [...warnings].sort() }
}

// Signature-less format: UTF-8 text whose first token is an XML declaration or <svg.
export const looksLikeSvg = (bytes) => /^(?:\uFEFF)?\s*<(?:\?xml|svg|!--)/.test(Buffer.from(bytes.subarray(0, 256)).toString('utf8'))

// A stored/packaged SVG must already be canonical: only the sanitizer's own output is accepted.
export function validateSvg(bytes, limits = SVG_LIMITS) {
  const result = sanitizeSvg(bytes, limits)
  if (!result.data.equals(Buffer.from(bytes))) throw fail('svg_forbidden_content', 'El SVG no está sanitizado.', ['not-canonical'])
  return result
}
