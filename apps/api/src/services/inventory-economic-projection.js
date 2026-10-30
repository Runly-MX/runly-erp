// Operational projection only. Stored legacy prices, imports and audit evidence
// are never rewritten. Original attachments are returned unchanged.
import { createPurchaseEconomicMode } from './purchase-economic-mode.js'

const ECONOMIC_NAME = /precio|importe|monto|costo|coste|valor.*(compra|adquisici[oó]n)|subtotal|impuesto|saldo|pagado|amount|price|cost|tax/i
export const isEconomicInventoryField = field => Boolean(field && (
  ['number', 'currency', 'money'].includes(field.fieldType) || field.options?.economic === true ||
  ECONOMIC_NAME.test(`${field.fieldKey ?? ''} ${field.label ?? ''}`)
))

export function projectInventoryEconomics(item, mode) {
  if (!item || mode !== 'DOCUMENTARY') return item
  return {
    ...item, purchasePrice: null,
    customValues: item.customValues?.map(cv => isEconomicInventoryField(cv.field) ? { ...cv, value: null, economicValueSuppressed: true } : cv),
    purchaseEconomicContext: { economicMode: mode, economicCaptureEnabled: false, structuredEconomicsVisible: false, historicalDataPreserved: true, numericCustomFieldsSuppressed: true, originalFilesUnchanged: true },
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
