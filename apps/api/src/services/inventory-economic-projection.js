// Operational projection only. Stored legacy prices, imports and audit evidence
// are never rewritten. Original attachments are returned unchanged.
import { createPurchaseEconomicMode } from './purchase-economic-mode.js'

const ECONOMIC_NAME = /\b(precios?|importes?|montos?|costos?|costes?|subtotal|impuestos?|saldo|pagado|amount|price|cost|tax)\b|\bvalor\b.*\b(compra|adquisicion)\b/i
const economicIdentifier = value => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\W]+/g, ' ')
export const isEconomicInventoryField = field => Boolean(field && (
  ['currency', 'money'].includes(field.fieldType) || field.options?.economic === true ||
  [field.fieldKey, field.label].some(value => ECONOMIC_NAME.test(economicIdentifier(value)))
))

export function projectInventoryEconomics(item, mode) {
  if (!item || mode !== 'DOCUMENTARY') return item
  return {
    ...item, purchasePrice: null,
    customValues: item.customValues?.map(cv => isEconomicInventoryField(cv.field) ? { ...cv, value: null, economicValueSuppressed: true } : cv),
    purchaseEconomicContext: { economicMode: mode, economicCaptureEnabled: false, structuredEconomicsVisible: false, historicalDataPreserved: true, numericCustomFieldsSuppressed: false, originalFilesUnchanged: true },
  }
}

export function createInventoryEconomicProjection({ prisma }) {
  const economics = createPurchaseEconomicMode({ prisma })
  async function mode(companyId) { return economics.companyMode(companyId) }
  async function many(companyId, items) {
    const current = await mode(companyId)
    return items.map(item => projectInventoryEconomics(item, current))
  }
  async function one(companyId, item) { return projectInventoryEconomics(item, await mode(companyId)) }
  return { mode, one, many }
}
