import { validateDocument } from './document.js'

export const PAGE_PRESETS = Object.freeze([
  { value: 'square', label: 'Publicación cuadrada', width: 1080, height: 1080 },
  { value: 'story', label: 'Historia vertical', width: 1080, height: 1920 },
  { value: 'banner', label: 'Banner horizontal', width: 1920, height: 1080 },
  { value: 'presentation', label: 'Presentación', width: 1920, height: 1080 },
  { value: 'card', label: 'Tarjeta horizontal', width: 1050, height: 600 },
  { value: 'custom', label: 'Personalizado' },
])

export function resizeDocument(document, page, scaleContent = false) {
  const current = validateDocument(document)
  const scale = Math.min(page.width / current.page.width, page.height / current.page.height)
  return validateDocument({ ...current, page, objects: scaleContent ? current.objects.map(object => ({ ...object,
    x: object.x * scale, y: object.y * scale,
    ...(['text','line'].includes(object.type) ? { scaleX: object.scaleX * scale, scaleY: object.scaleY * scale } : { width: object.width * scale, height: object.height * scale }),
  })) : current.objects })
}
