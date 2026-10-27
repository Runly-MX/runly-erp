import { validateDocument } from '../../../../../shared/studio/document.js'

let entry = null
export function createScopedClipboard(scope, clock = Date.now) {
  return {
    write(document, objects) {
      const clean = validateDocument({ ...document, objects, additionalPages: [] })
      if (JSON.stringify(clean).length * 2 > 1_000_000) throw new Error('La selección supera el límite del portapapeles.')
      entry = { scope, document: clean, until: clock() + 10 * 60 * 1000 }
    },
    read() {
      if (!entry || entry.scope !== scope || entry.until <= clock()) { entry = null; return [] }
      return validateDocument(entry.document).objects
    },
  }
}
