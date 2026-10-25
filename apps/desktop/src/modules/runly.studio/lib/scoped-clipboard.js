import { validateDocument, STUDIO_LIMITS } from '../../../../../shared/studio/document.js'

let entry = null
export function createScopedClipboard(scope, clock = Date.now) {
  return {
    write(document, objects) {
      const clean = validateDocument({ ...document, objects })
      if (JSON.stringify(clean).length * 2 > STUDIO_LIMITS.bytes) throw new Error('La selección supera el límite del portapapeles.')
      entry = { scope, document: clean, until: clock() + 10 * 60 * 1000 }
    },
    read() {
      if (!entry || entry.scope !== scope || entry.until <= clock()) { entry = null; return [] }
      return validateDocument(entry.document).objects
    },
  }
}
