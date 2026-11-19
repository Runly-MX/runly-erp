// Studio page → Atlas Website sections (pure; used by the dialog for its report and by the
// API, which builds the authoritative page). Every object becomes its own editable Atlas
// element when one exists (text, photo, box); otherwise an image of that object only. The
// page is never flattened into one picture.
//
// Responsive policy: desktop keeps the composition (absolute elements in a free container,
// scaled to a 960 px canvas, Studio stacking order as `layer`); tablet and phone stack the
// elements in reading order (top to bottom, left to right) at full or proportional width.
import { classify, objectSize, placement } from './object-kinds.js'
import { studioFontStyle } from './fonts.js'

export const WEBSITE_CANVAS = 960
// Content width used to size stacked photos and shapes (preview widths 834/390 minus 2×32 px).
export const STACK_WIDTH = Object.freeze({ tablet: 770, mobile: 326 })
const ENTER = Object.freeze({ fade: 'fade-in', rotate: 'rotate-in', 'slide-up': 'slide-up', 'slide-down': 'slide-down', 'slide-left': 'slide-left', 'slide-right': 'slide-right', 'slide-fade-up': 'slide-fade-up', 'slide-fade-down': 'slide-fade-down', 'slide-fade-left': 'slide-fade-left', 'slide-fade-right': 'slide-fade-right', 'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out',
  // Closest Atlas preset: a shorter float is a slide-fade, a fly-in a slide, grow a zoom-in.
  'float-up': 'slide-fade-up', 'float-down': 'slide-fade-down', 'float-left': 'slide-fade-left', 'float-right': 'slide-fade-right',
  'fly-up': 'slide-up', 'fly-down': 'slide-down', 'fly-left': 'slide-left', 'fly-right': 'slide-right', grow: 'zoom-in' })
const WEIGHTS = [400, 500, 600, 700, 800, 900]
const BOX_TYPES = new Set(['rectangle', 'ellipse'])
const round = value => Math.round(value)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const hex = color => (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : typeof color === 'string' && /^#[0-9a-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map(c => c + c).join('')}`.toLowerCase() : '#000000')

export const LOSSES = Object.freeze({
  font: 'Los textos usan la tipografía del sitio; la fuente de Studio no se conserva.',
  textStyle: 'Cursiva, subrayado, tachado, espaciado entre letras, contorno y sombra del texto no se conservan.',
  justify: 'El texto justificado se alinea a la izquierda.',
  dash: 'Los bordes discontinuos o punteados se convierten en continuos.',
  motion: 'Los efectos de salida y énfasis y los keyframes no se convierten: cada elemento queda en su posición del diseño.',
  pop: 'Las entradas rebote, barrido, revelar, elástica y espiral no tienen equivalente en Website y se omiten.',
  timing: 'Las entradas de más de 5 s de duración o retardo se acortan a 5 s.',
  slide: 'Las duraciones y transiciones de diapositiva no aplican a una página web.',
  gradientPage: 'Los fondos degradados de página se convierten en su primer color.',
  layers: 'Hay más de 100 elementos: los últimos comparten la capa superior.',
  groupLayers: 'Un grupo se convierte en un contenedor: los elementos que lo atraviesan en el orden de capas quedan por encima o por debajo de todo el grupo.',
  tall: 'La página supera la altura máxima de Website (4000 px a escala de escritorio) y se recorta.',
  textLength: 'Un texto supera 8000 caracteres y se recorta.',
})

export const canvasScale = page => Math.min(1, WEBSITE_CANVAS / page.width)
// text | box | image | raster | skip, with the reason when an object becomes an image.
// page: circles larger than 400 px on the desktop canvas exceed Atlas' 200 px corner radius.
export function websiteKind(item, page) {
  const base = classify(item)
  if (base.kind === 'skip' || base.kind === 'text' || base.kind === 'raster') return base
  if (base.kind === 'image') return { kind: 'image' }
  if (base.kind === 'line') return { kind: 'raster', reason: 'línea o flecha' }
  if (!BOX_TYPES.has(item.type)) return { kind: 'raster', reason: 'forma sin equivalente en Website' }
  if (item.type === 'ellipse' && Math.abs(item.width - item.height) > 1) return { kind: 'raster', reason: 'elipse no circular' }
  if (item.type === 'ellipse' && page && item.width * canvasScale(page) > 400) return { kind: 'raster', reason: 'círculo de más de 400 px en escritorio' }
  return base.kind === 'photo-shape' ? { kind: 'image', shaped: true } : { kind: 'box' }
}

// Objects of one page that need an image of themselves (the browser renders them).
export const rasterObjects = scene => scene.objects.filter(item => websiteKind(item, scene.page).kind === 'raster')

function corners(item) {
  const { w, h } = objectSize(item), r = (item.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => [item.x + x * c - y * s, item.y + x * s + y * c])
}
const rotation = degrees => { const value = ((degrees % 360) + 360) % 360; return round(value > 180 ? value - 360 : value) }

// scene: { page, objects }; refs.image(fileAssetId) and refs.raster(objectId) → { src, box? }.
export function convertStudioPage(scene, refs) {
  const { page, objects } = scene, losses = new Set(), counts = { text: 0, image: 0, box: 0, raster: 0, group: 0 }
  const scale = canvasScale(page), width = round(page.width * scale), fullHeight = round(page.height * scale), height = Math.min(4000, fullHeight)
  if (fullHeight > 4000) losses.add(LOSSES.tall)
  if (page.slide) losses.add(LOSSES.slide)
  if (objects.length > 101) losses.add(LOSSES.layers)
  const layerOf = new Map(objects.map((item, index) => [item.id, Math.min(100, index)]))
  const offset = (value, max = 4000) => clamp(round(value), -2000, max)

  // Tablet: at least half the width; phone: photos and object images full width, shapes at least half.
  function stacked(kind, w, h) {
    if (kind === 'text') return { tabletPosition: 'flow', tabletRotation: 0, tabletWidthMode: 'fill', tabletHeightMode: 'auto' }
    const ratio = h / Math.max(1, w), tablet = clamp(round((w / width) * 100), 50, 100), mobile = kind === 'box' ? tablet : 100
    return { tabletPosition: 'flow', tabletRotation: 0, tabletWidthMode: 'percent', tabletWidthPercent: tablet, tabletHeightMode: 'fixed', tabletHeight: clamp(round(STACK_WIDTH.tablet * (tablet / 100) * ratio), 1, 4000),
      mobileWidthPercent: mobile, mobileHeight: clamp(round(STACK_WIDTH.mobile * (mobile / 100) * ratio), 1, 4000) }
  }
  // An object image already carries its opacity: only its entrance is added.
  function effects(item, { opacity = true } = {}) {
    const props = {}
    if (opacity && item.opacity !== undefined && item.opacity < 1) props._opacity = Math.round(item.opacity * 100) / 100
    if (item.exit || item.emphasis || item.keyframes?.length) losses.add(LOSSES.motion)
    if (item.enter) {
      const preset = ENTER[item.enter.preset]
      if (!preset) losses.add(LOSSES.pop)
      else {
        if (item.enter.duration > 5000 || item.enter.delay > 5000) losses.add(LOSSES.timing)
        props._animation = { preset, duration: clamp(round(item.enter.duration ?? 600), 0, 5000), delay: clamp(round(item.enter.delay ?? 0), 0, 5000), easing: item.enter.easing ?? 'ease-out' }
      }
    }
    return props
  }
  // origin: page px of the containing box (the canvas, or a group's top-left corner).
  function element(item, origin) {
    const { kind, shaped } = websiteKind(item, page)
    if (kind === 'skip') return null
    const frame = { x: -origin.x * scale, y: -origin.y * scale, scale }
    if (kind === 'raster') {
      const raster = refs.raster(item.id)
      if (!raster) throw new TypeError(`RASTER_MISSING:${item.id}`)
      const box = raster.box, w = Math.max(1, round(box.width * scale)), h = Math.max(1, round(box.height * scale))
      counts.raster++
      return { item, top: box.y, left: box.x, node: { type: 'ImageElementBlock', props: { src: raster.src, alt: '', fit: 'contain', position: 'absolute', anchorX: 'left', anchorY: 'top', offsetX: offset((box.x - origin.x) * scale), offsetY: offset((box.y - origin.y) * scale), widthMode: 'fixed', width: w, heightMode: 'fixed', height: h, layer: layerOf.get(item.id), ...stacked('raster', w, h), ...effects(item, { opacity: false }) } } }
    }
    const box = placement(item, frame), w = Math.max(1, round(box.w)), h = Math.max(1, round(box.h))
    const base = { position: 'absolute', anchorX: 'left', anchorY: 'top', offsetX: offset(box.x), offsetY: offset(box.y), widthMode: 'fixed', width: w, layer: layerOf.get(item.id), rotation: rotation(box.rotate) }
    const top = Math.min(...corners(item).map(p => p[1])), left = Math.min(...corners(item).map(p => p[0]))
    if (kind === 'text') {
      counts.text++
      const style = studioFontStyle(item.fontFamily, item.fontVariant) ?? { weight: 400, style: 'normal' }
      if (item.fontFamily && item.fontFamily !== 'sans-serif') losses.add(LOSSES.font)
      if (style.style === 'italic' || item.underline || item.linethrough || item.charSpacing || item.stroke || item.shadow) losses.add(LOSSES.textStyle)
      if (item.textAlign === 'justify') losses.add(LOSSES.justify)
      if (item.text.length > 8000) losses.add(LOSSES.textLength)
      const weight = WEIGHTS.find(value => value >= style.weight) ?? 900
      return { item, top, left, node: { type: 'TextElementBlock', props: { ...base, heightMode: 'auto', text: item.text.slice(0, 8000), tag: 'p', fontSize: clamp(round(item.fontSize * (item.scaleY ?? 1) * scale), 8, 200), fontWeight: String(weight), lineHeight: clamp(Math.round((item.lineHeight ?? 1.2) * 10) / 10, 0.8, 3), textAlign: ['left', 'center', 'right'].includes(item.textAlign) ? item.textAlign : 'left', textColor: hex(item.fill), paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, ...stacked('text', w, h), ...effects(item) } } }
    }
    const radius = item.type === 'ellipse' ? round(w / 2) : round((item.shape?.radius ?? 0) * scale)
    const sized = { ...base, heightMode: 'fixed', height: h, ...(radius ? { cornerRadius: clamp(radius, 0, 200) } : {}), ...stacked(kind, w, h), ...effects(item) }
    if (kind === 'image') {
      counts.image++
      const source = shaped ? item.fillPaint : item
      return { item, top, left, node: { type: 'ImageElementBlock', props: { ...sized, src: refs.image(source.fileAssetId).src, alt: '', fit: (shaped ? source.image : item.image)?.fit === 'contain' ? 'contain' : 'cover' } } }
    }
    counts.box++
    const shape = item.shape ?? {}, stroke = shape.strokeWidth > 0 ? { borderColor: hex(shape.strokeColor), borderWidth: clamp(Math.max(1, round(shape.strokeWidth * scale)), 1, 16) } : {}
    if (shape.strokeWidth > 0 && shape.dash && shape.dash !== 'solid') losses.add(LOSSES.dash)
    return { item, top, left, node: { type: 'BoxBlock', props: { ...sized, ...(shape.fillEnabled === false ? {} : { backgroundColor: hex(item.fill) }), ...stroke } } }
  }
  const reading = (a, b) => (Math.abs(a.top - b.top) > 8 ? a.top - b.top : a.left - b.left)

  // Groups become free containers at their bounding box; their members keep their own layer.
  const groups = new Map()
  for (const item of objects) if (item.groupId && websiteKind(item, page).kind !== 'skip') groups.set(item.groupId, [...(groups.get(item.groupId) ?? []), item])
  for (const [id, members] of groups) if (members.length < 2) groups.delete(id)
  const entries = [], placed = new Set()
  for (const item of objects) {
    if (placed.has(item.id)) continue
    const members = item.groupId && groups.get(item.groupId)
    if (!members) { const node = element(item, { x: 0, y: 0 }); if (node) entries.push(node); placed.add(item.id); continue }
    members.forEach(member => placed.add(member.id))
    const points = members.flatMap(member => (websiteKind(member, page).kind === 'raster' ? (b => [[b.x, b.y], [b.x + b.width, b.y + b.height]])(refs.raster(member.id)?.box ?? { x: member.x, y: member.y, width: 1, height: 1 }) : corners(member)))
    const x0 = Math.min(...points.map(p => p[0])), y0 = Math.min(...points.map(p => p[1])), x1 = Math.max(...points.map(p => p[0])), y1 = Math.max(...points.map(p => p[1]))
    const indexes = members.map(member => objects.indexOf(member)), first = Math.min(...indexes), last = Math.max(...indexes)
    if (last - first + 1 > members.length) losses.add(LOSSES.groupLayers)
    const children = members.map(member => element(member, { x: x0, y: y0 })).filter(Boolean).sort(reading).map(entry => entry.node)
    const w = Math.max(1, round((x1 - x0) * scale)), h = Math.max(1, round((y1 - y0) * scale))
    counts.group++
    entries.push({ top: y0, left: x0, node: { type: 'BoxBlock', props: { layout: 'free', position: 'absolute', anchorX: 'left', anchorY: 'top', offsetX: offset(x0 * scale), offsetY: offset(y0 * scale), widthMode: 'fixed', width: w, heightMode: 'fixed', height: h, layer: layerOf.get(objects[first].id), tabletLayout: 'column', gap: 16, tabletPosition: 'flow', tabletWidthMode: 'fill', tabletHeightMode: 'auto', tabletMinHeight: 0 }, children: { children } } })
  }
  const canvas = { type: 'BoxBlock', props: { layout: 'free', widthMode: 'fixed', width, heightMode: 'fixed', height, gap: 16, tabletLayout: 'column', mobileLayout: 'column', tabletWidthMode: 'fill', tabletHeightMode: 'auto', tabletMinHeight: 0 }, children: { children: entries.sort(reading).map(entry => entry.node) } }
  const gradient = page.backgroundPaint?.type === 'gradient'
  if (gradient) losses.add(LOSSES.gradientPage)
  const background = hex(gradient ? page.backgroundPaint.stops?.[0]?.color : page.background)
  const section = { type: 'SectionBlock', props: { paddingY: '0', paddingX: '8', fullBleed: true, maxWidth: '1024px', background: { kind: 'color', token: '', value: background } }, children: { children: [canvas] } }
  return { sections: [section], losses: [...losses], counts }
}
