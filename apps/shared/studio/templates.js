import { appendObject, blankDocument, validateDocument } from './document.js'

const rect = (x, y, width, height, fill) => ({ type: 'rectangle', x, y, width, height, fill })
const circle = (x, y, size, fill) => ({ type: 'ellipse', x, y, width: size, height: size, fill })
const text = (x, y, width, fontSize, fill, value) => ({ type: 'text', x, y, width, fontSize, fill, text: value,
  height: Math.ceil(value.split('\n').length * fontSize * 1.2) })

// Original starting points built only from the document primitives
// (rectangles, ellipses, text), so every element stays editable.
const DEFINITIONS = [
  { key: 'square', name: 'Lanzamiento', width: 1080, height: 1080, background: '#0f0a1f', objects: [
    circle(620, -160, 620, '#d946ef'), circle(-180, 640, 560, '#7c3aed'),
    rect(80, 80, 180, 52, '#ffffff'), text(104, 92, 140, 24, '#0f0a1f', 'NUEVO'),
    text(80, 300, 900, 104, '#ffffff', 'Lanza tu\nidea al mundo'),
    text(80, 580, 760, 36, '#e9d5ff', 'Una frase breve que invite a descubrir más.'),
    rect(80, 880, 320, 88, '#d946ef'), text(120, 902, 260, 36, '#ffffff', 'Descúbrelo'),
  ] },
  { key: 'poster', name: 'Encuentro creativo', width: 800, height: 1120, background: '#fdf4ff', objects: [
    rect(0, 0, 800, 560, '#1e1b4b'), circle(440, 120, 300, '#f472b6'), circle(520, 200, 300, '#a78bfa'),
    text(56, 150, 520, 80, '#ffffff', 'ENCUENTRO\nCREATIVO'), text(56, 420, 400, 32, '#f9a8d4', '14 · 16 NOV'),
    text(56, 620, 688, 36, '#1e1b4b', 'Charlas, talleres y música en vivo para quienes crean.'),
    rect(56, 900, 688, 4, '#d946ef'), text(56, 940, 688, 28, '#6b21a8', 'Centro Cultural · Entrada libre'),
  ] },
  { key: 'story', name: 'Oferta especial', width: 1080, height: 1920, background: '#111827', objects: [
    circle(-200, -200, 900, '#f97316'), circle(500, 1300, 900, '#db2777'),
    text(90, 620, 900, 140, '#ffffff', 'OFERTA\nESPECIAL'), text(90, 1000, 900, 220, '#fde68a', '-40%'),
    rect(90, 1560, 520, 110, '#ffffff'), text(140, 1588, 440, 44, '#111827', 'Compra ahora'),
  ] },
  { key: 'slides', name: 'Presentación', width: 1920, height: 1080, background: '#f8fafc', objects: [
    rect(0, 0, 760, 1080, '#4c1d95'), circle(420, 640, 600, '#d946ef'),
    text(880, 200, 900, 36, '#7c3aed', 'Q4 · 2026'), text(880, 280, 960, 110, '#0f172a', 'Título de tu\npresentación'),
    text(880, 600, 900, 40, '#475569', 'Subtítulo o nombre de quien presenta'),
  ] },
  { key: 'certificate', name: 'Reconocimiento', width: 1400, height: 1000, background: '#ffffff', objects: [
    rect(40, 40, 1320, 920, '#faf5ff'), rect(40, 40, 24, 920, '#7c3aed'),
    circle(1120, 700, 200, '#d946ef'), circle(1150, 730, 140, '#faf5ff'),
    text(160, 160, 1000, 36, '#7c3aed', 'RECONOCIMIENTO'), text(160, 300, 1080, 96, '#1e1b4b', 'Nombre de la persona'),
    text(160, 480, 900, 36, '#475569', 'Por su participación, compromiso y aporte al equipo.'),
    rect(160, 780, 420, 3, '#1e1b4b'), text(160, 800, 420, 24, '#64748b', 'Firma'),
  ] },
  { key: 'banner', name: 'Anuncio web', width: 1200, height: 630, background: '#ecfeff', objects: [
    circle(780, -120, 520, '#14b8a6'), circle(900, 300, 400, '#0ea5e9'),
    text(64, 180, 700, 72, '#134e4a', 'Tu marca, en grande'), text(64, 360, 640, 30, '#0f766e', 'Mensaje corto para tu sitio o redes.'),
    rect(64, 460, 260, 72, '#0f766e'), text(96, 476, 220, 30, '#ffffff', 'Saber más'),
  ] },
]

export const STUDIO_TEMPLATES = Object.freeze(DEFINITIONS.map(({ key, name, width, height }) => Object.freeze({ key, name, width, height })))

export function templateDocument(key) {
  const template = DEFINITIONS.find(item => item.key === key)
  if (!template) return blankDocument()
  const base = blankDocument(template.width, template.height)
  let doc = validateDocument({ ...base, page: { ...base.page, background: template.background } })
  for (const { type, ...object } of template.objects) doc = appendObject(doc, type, object)
  return doc
}
