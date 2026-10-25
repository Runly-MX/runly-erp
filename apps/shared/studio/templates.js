import { appendObject, blankDocument } from './document.js'

export const STUDIO_TEMPLATES = Object.freeze([
  { key: 'square', name: 'Una idea para compartir', width: 1080, height: 1080 },
  { key: 'poster', name: 'Encuentro creativo', width: 800, height: 1120 },
  { key: 'certificate', name: 'Reconocimiento', width: 1400, height: 1000 },
])

export function templateDocument(key) {
  const template = STUDIO_TEMPLATES.find(item => item.key === key)
  if (!template) return blankDocument()
  let doc = blankDocument(template.width, template.height)
  doc = appendObject(doc, 'rectangle', { x: 40, y: 40, width: template.width - 80, height: 24, fill: '#2563eb' })
  doc = appendObject(doc, 'ellipse', { x: template.width - 300, y: template.height - 300, width: 240, height: 240, fill: '#dbeafe' })
  doc = appendObject(doc, 'text', { x: 80, y: 160, width: template.width - 160, height: 160, fontSize: 64,
    text: key === 'certificate' ? 'Reconocimiento' : template.name, fill: '#172554' })
  return appendObject(doc, 'text', { x: 80, y: 400, width: template.width - 160, height: 160, fontSize: 32, fill: '#334155',
    text: key === 'certificate' ? 'Se otorga a: Nombre de ejemplo\nPor su participación y compromiso.' : 'Tu mensaje empieza aquí.\nDale forma y compártelo.' })
}
