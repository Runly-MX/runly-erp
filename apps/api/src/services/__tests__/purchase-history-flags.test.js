import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPurchasesNavVisible, purchaseHistoryFlags } from '../purchases-service.js'

const fake = (present) => new Proxy({}, { get: (_, model) => ({ findFirst: async ({ where }) => (present.includes(model) && !(model === 'purchaseInvoice' && where.paidAmount) ? { id: 'x' } : null) }) })

test('automatic cases (every SIMPLE document opens one) do not keep Expedientes in the sidebar', async () => {
  const simple = await purchaseHistoryFlags(fake(['purchaseCase', 'purchaseInvoice']), 'company-simple')
  assert.equal(simple.cases, false); assert.equal(simple.invoices, true)
  assert.equal(isPurchasesNavVisible('/purchases/cases', { invoices: true }, simple), false)
  const used = await purchaseHistoryFlags(fake(['purchaseCase', 'purchaseApproval']), 'company-used')
  assert.equal(used.cases, true)
  assert.equal(isPurchasesNavVisible('/purchases/cases', { invoices: true }, used), true)
})
