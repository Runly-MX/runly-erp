// Studio → PowerPoint mapping (pure; pptxgenjs options in inches). Every object becomes
// its own editable PowerPoint element when there is an equivalent; otherwise one image
// for that object only, with the reason reported. A slide is never one flattened image.
//
// Slide size policy: PowerPoint has one size per file. The first exported page sets the
// proportion (13.333 in on its long side, the 16:9 width). Pages with another proportion
// are scaled uniformly and centred: black bars, page background as an editable rectangle.
import { DEFAULT_IMAGE } from '../../../../../shared/studio/image-properties.js'
import { studioFontStyle } from '../../../../../shared/studio/fonts.js'
import { slideDuration } from '../../../../../shared/studio/motion.js'

export const SLIDE_LONG_SIDE = 13.333
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits
const hex = color => color.replace('#', '').toUpperCase()
const SCALED = new Set(['text', 'line'])

export function presentationLayout(firstPage) {
  const landscape = firstPage.width >= firstPage.height
  return landscape ? { width: SLIDE_LONG_SIDE, height: round(SLIDE_LONG_SIDE * firstPage.height / firstPage.width) } : { width: round(SLIDE_LONG_SIDE * firstPage.width / firstPage.height), height: SLIDE_LONG_SIDE }
}
// Inches per page pixel and the page's position on the slide.
export function pageFrame(page, layout) {
  const scale = Math.min(layout.width / page.width, layout.height / page.height)
  const x = (layout.width - page.width * scale) / 2, y = (layout.height - page.height * scale) / 2
  return { scale, x, y, width: page.width * scale, height: page.height * scale, letterboxed: x > 0.005 || y > 0.005 }
}
// Studio rotates around the top-left corner; PowerPoint around the centre of the box.
export function placement(item, frame) {
  const w = SCALED.has(item.type) ? item.width * (item.scaleX ?? 1) : item.width, h = SCALED.has(item.type) ? item.height * (item.scaleY ?? 1) : item.height
  const r = (item.rotation * Math.PI) / 180, cx = item.x + (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r), cy = item.y + (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r)
  return { x: round(frame.x + (cx - w / 2) * frame.scale), y: round(frame.y + (cy - h / 2) * frame.scale), w: round(w * frame.scale), h: round(h * frame.scale), rotate: round(((item.rotation % 360) + 360) % 360, 2) }
}
const transparency = item => (item.opacity === undefined || item.opacity >= 1 ? undefined : round((1 - item.opacity) * 100, 1))
// A photo PowerPoint can show as-is: rectangular mask, default framing, no border, shadow or adjustments.
const plainImage = image => !image || (image.mask === 'rectangle' && !image.offsetX && !image.offsetY && (image.zoom ?? 1) === 1 && !image.rotation && !image.flipX && !image.flipY
  && !image.border?.width && !image.shadow?.blur && !image.shadow?.offsetX && !image.shadow?.offsetY
  && Object.entries(image.adjustments ?? {}).every(([key, value]) => value === DEFAULT_IMAGE.adjustments[key]))

// What each Studio object becomes. `raster` keeps the object visible as an image of itself.
export function classify(item) {
  if (item.hidden) return { kind: 'skip' }
  if (item.type === 'text') return { kind: 'text' }
  if (item.type === 'line') return { kind: 'line' }
  if (item.type === 'vector') return { kind: 'raster', reason: item.code ? 'código QR o de barras' : 'icono o vector' }
  if (item.type === 'image') return plainImage(item.image) ? { kind: 'image' } : { kind: 'raster', reason: 'foto con máscara, encuadre, borde, sombra o ajustes' }
  const paint = item.fillPaint
  if (paint?.type === 'gradient') return { kind: 'raster', reason: 'degradado' }
  if (paint?.type === 'image') {
    const rounded = item.type === 'rectangle' && item.shape?.radius
    return plainImage(paint.image) && !rounded && !(item.shape?.strokeWidth) ? { kind: 'photo-shape' } : { kind: 'raster', reason: 'foto dentro de una forma con borde, esquinas o ajustes' }
  }
  return { kind: 'shape' }
}

export function textOptions(item, frame) {
  const box = placement(item, frame), style = studioFontStyle(item.fontFamily, item.fontVariant) ?? { weight: 400, style: 'normal' }
  const fontSize = round(item.fontSize * (item.scaleY ?? 1) * frame.scale * 72, 2)
  return {
    ...box, margin: 0, valign: 'top', fit: 'none', wrap: true,
    fontFace: item.fontFamily === 'sans-serif' ? 'Arial' : item.fontFamily, fontSize, color: hex(item.fill), transparency: transparency(item),
    bold: style.weight >= 600, italic: style.style === 'italic', align: item.textAlign === 'justify' ? 'justify' : item.textAlign,
    lineSpacingMultiple: item.lineHeight, charSpacing: item.charSpacing ? round((item.charSpacing / 1000) * fontSize, 2) : undefined,
    underline: item.underline ? { style: 'sng' } : undefined, strike: item.linethrough ? 'sngStrike' : undefined,
  }
}

const DASH = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' }
export function shapeOptions(item, frame) {
  const box = placement(item, frame), style = item.shape ?? {}, alpha = transparency(item)
  const color = item.fillPaint?.type === 'solid' ? item.fillPaint.color : item.fill
  const options = { ...box, fill: style.fillEnabled === false ? { type: 'none' } : { color: hex(color), transparency: alpha } }
  if (style.strokeWidth) options.line = { color: hex(style.strokeColor), width: round(style.strokeWidth * frame.scale * 72, 2), dashType: DASH[style.dash] ?? 'solid', transparency: alpha }
  if (item.type === 'rectangle' && style.radius) options.rectRadius = round(Math.min(style.radius, item.width / 2, item.height / 2) * frame.scale)
  return { shape: item.type === 'ellipse' ? 'ellipse' : style.radius ? 'roundRect' : 'rect', options }
}

// Polyline as custom geometry; caps PowerPoint lacks (square, bar) are reported.
const CAP = { none: 'none', arrow: 'triangle', 'open-arrow': 'arrow', circle: 'oval', diamond: 'diamond' }
export function lineOptions(item, frame) {
  const box = placement(item, frame), lost = []
  const cap = name => { if (name === 'square' || name === 'bar') lost.push(`extremo «${name === 'square' ? 'cuadrado' : 'barra'}»`); return CAP[name] ?? 'none' }
  return {
    options: { ...box, points: item.points.map(([x, y]) => ({ x: round(x * box.w), y: round(y * box.h) })),
      line: { color: hex(item.fill), width: round(item.strokeWidth * (item.scaleY ?? 1) * frame.scale * 72, 2), dashType: DASH[item.dash], beginArrowType: cap(item.startCap), endArrowType: cap(item.endCap), transparency: transparency(item) } },
    lost,
  }
}

export function imageOptions(item, frame, data, { fit = 'cover', rounded = false } = {}) {
  const box = placement(item, frame)
  return { ...box, data, sizing: { type: fit, w: box.w, h: box.h }, transparency: transparency(item), ...(rounded ? { rounding: true } : {}) }
}

// ---- Transitions: bounded PresentationML, checked with an Office round-trip ------------
// Base-schema elements only (no p14 extensions). Verified with Collabora/LibreOffice
// (2026-11-16): <p:fade/> and its advance time survive a re-save (time rounded to whole
// seconds). <p:push> came back with the horizontal direction reversed and <p:zoom/> was
// dropped, so slide and zoom transitions are NOT exported: those slides change without an
// effect (<p:cut/>, standard; LibreOffice ignores its advance time) and it is reported.
export const MAPPED_TRANSITIONS = Object.freeze(['fade'])
export const speedOf = ms => (ms <= 600 ? 'fast' : ms <= 875 ? 'med' : 'slow')
export function transitionXml(page, { first = false } = {}) {
  const transition = first ? null : page.slide?.transition, fade = transition?.type === 'fade'
  return `<p:transition${fade ? ` spd="${speedOf(transition.duration)}"` : ''} advTm="${slideDuration(page)}">${fade ? '<p:fade/>' : '<p:cut/>'}</p:transition>`
}
// p:transition goes after p:clrMapOvr and before p:timing / p:extLst (PresentationML order).
export function injectTransition(slideXml, fragment) {
  for (const marker of ['<p:timing', '<p:extLst', '</p:sld>']) {
    const at = slideXml.lastIndexOf(marker)
    if (at >= 0 && (marker !== '<p:extLst' || slideXml.indexOf('</p:clrMapOvr>') < at)) return slideXml.slice(0, at) + fragment + slideXml.slice(at)
  }
  throw new Error('Diapositiva PowerPoint inesperada.')
}
