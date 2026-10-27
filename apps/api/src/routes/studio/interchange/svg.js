import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { blankDocument, appendObject, StudioError } from '../../../../../shared/studio/document.js'
import { iconGeometry } from '../../../../../shared/studio/svg-geometry.js'
import { gradientPaint } from '../../../../../shared/studio/gradient.js'

const unsupported = detail => { throw new StudioError(`SVG no compatible: ${detail}. No se ha rasterizado ni importado parcialmente.`, 400, 'STUDIO_SVG_UNSUPPORTED') }
const color = value => {
  if (value === 'none') return null
  if (['black', 'white'].includes(value)) return value === 'black' ? '#000000' : '#ffffff'
  if (/^#[a-f0-9]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(c => c + c).join('')
  if (/^#[a-f0-9]{6}$/i.test(value)) return value.toLowerCase()
  return unsupported('color o pintura')
}
const number = (value, fallback = 0) => {
  const n = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > 16384) unsupported('valor numérico')
  return n
}
const fraction = (value, fallback) => value === undefined ? fallback : String(value).endsWith('%') ? number(String(value).slice(0, -1)) / 100 : number(value)
const attrs = node => Object.fromEntries(Object.entries(node[':@'] ?? {}).map(([k, v]) => [k.replace(/^@_/, ''), v]))
function keys(a, allowed) { if (Object.keys(a).some(k => !allowed.includes(k))) unsupported('atributo fuera del subconjunto seguro') }
const shared = ['id', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform']

export function importSvgPage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 32000) unsupported('máximo 32 kB de XML')
  let xml
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim() } catch { unsupported('UTF-8') }
  xml = xml.replace(/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>\s*/i, '')
  if (/[&!?]/.test(xml) || XMLValidator.validate(xml) !== true) unsupported('XML, entidades o declaraciones activas')
  const tree = new XMLParser({ ignoreAttributes: false, preserveOrder: true, parseAttributeValue: false, trimValues: false }).parse(xml)
  if (tree.length !== 1 || !tree[0].svg) unsupported('raíz SVG')
  const root = attrs(tree[0]); keys(root, ['xmlns', 'width', 'height', 'viewBox', 'version'])
  if (root.xmlns && root.xmlns !== 'http://www.w3.org/2000/svg') unsupported('namespace')
  const viewBox = root.viewBox?.trim().split(/[\s,]+/).map(Number)
  if (viewBox && (viewBox.length !== 4 || viewBox.some(n => !Number.isFinite(n)))) unsupported('viewBox')
  const width = number(root.width, viewBox?.[2]), height = number(root.height, viewBox?.[3])
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width > 4096 || height > 4096 || viewBox && (viewBox[2] !== width || viewBox[3] !== height)) unsupported('dimensiones; width/height deben coincidir con viewBox en px')
  const gradients = new Map(), warnings = ['La página SVG usa fondo blanco en Studio; la transparencia exterior no se conserva.']
  let doc = blankDocument(width, height), ordinal = 0, groups = 0
  const nodes = tree[0].svg
  const significant = list => list.filter(n => !(typeof n['#text'] === 'string' && !n['#text'].trim()))
  for (const node of nodes.filter(n => n.defs)) {
    keys(attrs(node), [])
    for (const definition of significant(node.defs)) {
    const kind = Object.keys(definition).find(k => k !== ':@'), a = attrs(definition)
    if (!['linearGradient', 'radialGradient'].includes(kind)) unsupported('definición')
    keys(a, kind === 'linearGradient' ? ['id','gradientUnits','x1','y1','x2','y2'] : ['id','gradientUnits','cx','cy','r','fx','fy'])
    if (!/^[a-zA-Z][\w-]{0,63}$/.test(a.id ?? '') || gradients.has(a.id) || a.gradientUnits && a.gradientUnits !== 'objectBoundingBox') unsupported('identidad o unidades del degradado')
    const stops = significant(definition[kind]).map(stop => {
      if (!stop.stop || stop.stop.some(n => !n['#text'] || n['#text'].trim())) unsupported('parada del degradado')
      const s = attrs(stop); keys(s, ['offset','stop-color','stop-opacity'])
      return { offset: fraction(s.offset, 0), color: color(s['stop-color'] ?? '#000000'), opacity: fraction(s['stop-opacity'], 1) }
    })
    let paint
    if (kind === 'linearGradient') {
      const x1 = fraction(a.x1, 0), y1 = fraction(a.y1, 0), x2 = fraction(a.x2, 1), y2 = fraction(a.y2, 0)
      const angle = x1 === 0 && x2 === 1 && y1 === y2 ? 0 : x1 === 1 && x2 === 0 && y1 === y2 ? 180 : y1 === 0 && y2 === 1 && x1 === x2 ? 90 : y1 === 1 && y2 === 0 && x1 === x2 ? -90 : unsupported('degradado lineal no equivalente al motor')
      paint = { type: 'gradient', gradientType: 'linear', angle, stops }
    } else {
      const centerX = fraction(a.cx, 0.5), centerY = fraction(a.cy, 0.5)
      if (fraction(a.fx, centerX) !== centerX || fraction(a.fy, centerY) !== centerY) unsupported('foco radial desplazado')
      paint = { type: 'gradient', gradientType: 'radial', centerX, centerY, radius: fraction(a.r, 0.5), stops }
    }
    try { gradients.set(a.id, gradientPaint(paint)) } catch { unsupported('paradas o parámetros de degradado') }
    }
  }
  const add = (type, properties, groupId) => { doc = appendObject(doc, type, { id: `svg-${++ordinal}`, ...properties, ...(groupId ? { groupId } : {}) }) }
  function visit(list, inherited, offset, group, depth) {
    if (depth > 12) unsupported('profundidad de grupos')
    for (const node of list) {
      const tag = Object.keys(node).find(k => k !== ':@'), own = attrs(node)
      if (tag === '#text' && !String(node[tag]).trim()) continue
      if (tag === 'defs' && depth === 0) continue
      if (!['g','rect','circle','ellipse','path','line','polyline','polygon'].includes(tag)) unsupported(`elemento ${String(tag).slice(0, 40)}`)
      const geometry = { g: [], rect: ['x','y','width','height','rx','ry'], circle: ['cx','cy','r'], ellipse: ['cx','cy','rx','ry'], path: ['d'], line: ['x1','y1','x2','y2'], polyline: ['points'], polygon: ['points'] }
      keys(own, [...shared, ...geometry[tag]])
      const a = { ...inherited, ...own }, next = { ...offset }
      if (own.transform) {
        const m = own.transform.match(/^translate\(\s*([-+\d.eE]+)(?:[\s,]+([-+\d.eE]+))?\s*\)$/)
        if (!m) unsupported('transformación; inicialmente solo translate')
        next.x += number(m[1]); next.y += number(m[2])
      }
      delete a.transform
      if (tag === 'g') {
        if (number(own.opacity, 1) !== 1) unsupported('opacidad de grupo con composición')
        if (group && !warnings.includes('Los grupos anidados se aplanan al grupo exterior.')) warnings.push('Los grupos anidados se aplanan al grupo exterior.')
        visit(node.g, a, next, group ?? `svg-group-${++groups}`, depth + 1); continue
      }
      if (node[tag].some(n => !n['#text'] || String(n['#text']).trim())) unsupported('contenido dentro de una primitiva')
      const fillRef = a.fill?.match(/^url\(#([a-zA-Z][\w-]{0,63})\)$/), fillPaint = fillRef ? gradients.get(fillRef[1]) : null
      if (fillRef && !fillPaint) unsupported('referencia de degradado')
      const fill = fillRef ? '#000000' : color(a.fill ?? '#000000'), stroke = color(a.stroke ?? 'none'), strokeWidth = number(a['stroke-width'], 1)
      const opacity = number(a.opacity, 1), fillOpacity = number(a['fill-opacity'], 1), strokeOpacity = number(a['stroke-opacity'], 1)
      if ([opacity,fillOpacity,strokeOpacity].some(n => n < 0 || n > 1) || opacity !== 1 && fill && stroke) unsupported('composición de opacidad entre relleno y trazo')
      if (!fill && !stroke) continue
      if (!['butt','round','square'].includes(a['stroke-linecap'] ?? 'butt') || !['miter','round','bevel'].includes(a['stroke-linejoin'] ?? 'miter')) unsupported('extremos o uniones del trazo')
      const x = number(a.x), y = number(a.y), w = number(a.width), h = number(a.height)
      const native = ['rect','circle','ellipse'].includes(tag)
      let px = x, py = y, pw = w, ph = h
      if (tag === 'circle' || tag === 'ellipse') { const rx = number(tag === 'circle' ? a.r : a.rx), ry = number(tag === 'circle' ? a.r : a.ry); px = number(a.cx) - rx; py = number(a.cy) - ry; pw = rx * 2; ph = ry * 2 }
      if (fillPaint && (!native || fillPaint.gradientType === 'radial' && pw !== ph)) unsupported('degradado sobre una geometría no equivalente')
      if (tag === 'rect' && (number(a.rx) || number(a.ry))) unsupported('radio SVG; exporta un path explícito')
      const localGroup = group ?? (fill && stroke ? `svg-piece-${++groups}` : undefined)
      if (fill && native) add(tag === 'rect' ? 'rectangle' : 'ellipse', { x: px + next.x, y: py + next.y, width: pw, height: ph, fill, opacity: opacity * fillOpacity, ...(fillPaint ? { fillPaint } : {}) }, localGroup)
      if (!native && fillPaint) unsupported('degradado de path')
      if ((!native && fill) || stroke) {
        if (width > 1024 || height > 1024) unsupported('paths: viewBox máximo de 1024 px')
        const geometricAttrs = geometry[tag].map(k => a[k] === undefined ? '' : `${k}="${a[k]}"`).join(' ')
        // Values came from parsed attributes, never interpolate arbitrary XML text.
        if (/[<>"&]/.test(geometry[tag].map(k => String(a[k] ?? '')).join(''))) unsupported('atributo de geometría')
        for (const mode of ['fill', 'stroke']) {
          if (mode === 'fill' && (native || !fill) || mode === 'stroke' && !stroke) continue
          const body = `<${tag} ${geometricAttrs} fill="${mode === 'fill' ? 'currentColor' : 'none'}" stroke="${mode === 'stroke' ? 'currentColor' : 'none'}" stroke-width="${strokeWidth}" stroke-linecap="${a['stroke-linecap'] ?? 'butt'}" stroke-linejoin="${a['stroke-linejoin'] ?? 'miter'}"/>`
          let geometry; try { geometry = iconGeometry(body, width, height) } catch { unsupported('geometría vectorial') }
          add('vector', { svgName: 'importacion.svg', geometry, x: next.x, y: next.y, width, height, fill: mode === 'fill' ? fill : stroke, opacity: opacity * (mode === 'fill' ? fillOpacity : strokeOpacity) }, localGroup)
        }
      }
    }
  }
  visit(nodes, {}, { x: -(viewBox?.[0] ?? 0), y: -(viewBox?.[1] ?? 0) }, null, 0)
  return { document: doc, warnings, original: xml, provenance: 'SVG local; subconjunto seguro, sin contenido activo. Licencia no verificada.' }
}
