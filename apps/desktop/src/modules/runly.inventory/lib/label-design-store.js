// Last-used Etiquetas design per company (localStorage). Only a convenience:
// every read/write is guarded and anything malformed falls back to defaults.
import { templateToDraft } from './label-layout.js'
import { clampSheet } from './label-sheet.js'

const KEY = (companyId) => `runly.inventory.labels.design.${companyId || 'default'}`
export const OUTPUT_MODES = ['roll', 'sheet']

// { templateId, printerId (null = browser, undefined = default), draft, output: { mode, sheet } }
export function sanitizeDesign(raw) {
  if (!raw || typeof raw !== 'object') return null
  const draft = raw.draft && typeof raw.draft === 'object' ? templateToDraft(raw.draft) : null
  if (draft && !Array.isArray(raw.draft.fields)) return null
  return {
    templateId: typeof raw.templateId === 'string' ? raw.templateId : null,
    printerId: typeof raw.printerId === 'string' || raw.printerId === null ? raw.printerId : undefined,
    draft,
    output: {
      mode: OUTPUT_MODES.includes(raw.output?.mode) ? raw.output.mode : 'roll',
      sheet: clampSheet(raw.output?.sheet),
    },
  }
}

export function loadDesign(companyId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY(companyId))
    return raw ? sanitizeDesign(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveDesign(companyId, design, storage = globalThis.localStorage) {
  try {
    const clean = sanitizeDesign(design)
    if (clean) storage?.setItem(KEY(companyId), JSON.stringify(clean))
    return Boolean(clean)
  } catch {
    return false
  }
}
