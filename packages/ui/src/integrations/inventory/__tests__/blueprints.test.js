import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INVENTORY_ITEM_DETAIL } from '../detail-blueprint.js'
import { buildItemFormBlueprint } from '../form-blueprint.js'

const labels = (blueprint) => blueprint.schema.sections.map((s) => s.label)
const fieldsOf = (blueprint, label) => blueprint.schema.sections.find((s) => s.label === label)?.fields.map((f) => f.field)

test('detail: purchase order and invoice live in Identificación; one acquisition and warranty card', () => {
  const sections = INVENTORY_ITEM_DETAIL.schema.sections
  assert.ok(fieldsOf(INVENTORY_ITEM_DETAIL, 'Identificación').includes('purchaseOrderLink'))
  assert.ok(fieldsOf(INVENTORY_ITEM_DETAIL, 'Identificación').includes('purchaseInvoiceLink'))
  assert.deepEqual(fieldsOf(INVENTORY_ITEM_DETAIL, 'Adquisición y garantía'), ['acquisitionOrigin', 'warrantyExpiry', 'warrantyNotes'])
  assert.ok(!labels(INVENTORY_ITEM_DETAIL).includes('Garantía'))
  assert.ok(!fieldsOf(INVENTORY_ITEM_DETAIL, 'Ubicación').includes('acquisitionOrigin'))
  const legacy = sections.find((s) => s.id === 'legacy-purchase')
  assert.equal(legacy.defaultCollapsed, true)
  // Users who see the Compras section get the inherited data there (tier 3).
  assert.deepEqual(legacy.visibleWhen, { field: 'showLegacyPurchaseSection', truthy: true })
})

test('detail: the area lives in Identificación, only when the company has areas, filtering by area id', () => {
  const identification = INVENTORY_ITEM_DETAIL.schema.sections.find((s) => s.id === 'identification')
  const area = identification.fields.find((f) => f.field === 'areaPath')
  assert.equal(identification.fields[0], area)
  assert.deepEqual(area.visibleWhen, { field: 'hasAreas', truthy: true })
  assert.deepEqual(area.filterBy, { param: 'areaId', valueField: 'areaFilterValue' })
})

test('detail: files are first in the aside column and follow Identificación on mobile', () => {
  const aside = INVENTORY_ITEM_DETAIL.schema.sections.filter((s) => s.column === 'aside')
  assert.equal(aside[0].id, 'attachments')
  assert.equal(aside[0].mobileAfter, 'identification')
  assert.ok(INVENTORY_ITEM_DETAIL.schema.sections.some((s) => s.id === 'identification'))
})

test('form: pickers only with Compras access, merged card, files aside after Identificación', () => {
  const without = buildItemFormBlueprint(true)
  assert.ok(!fieldsOf(without, 'Identificación').includes('purchaseOrderId'))
  const form = buildItemFormBlueprint(true, { showPurchaseLinks: true })
  assert.deepEqual(fieldsOf(form, 'Identificación').slice(-2), ['purchaseOrderId', 'purchaseInvoiceId'])
  assert.deepEqual(fieldsOf(form, 'Adquisición y garantía'), ['acquisitionOrigin', 'warrantyExpiry', 'warrantyNotes'])
  assert.ok(!labels(form).includes('Garantía') && !labels(form).includes('Origen de adquisición'))
  const files = form.schema.sections.find((s) => s.id === 'attachments')
  assert.equal(files.placement, 'aside')
  assert.equal(files.mobileAfter, 'identification')
})

test('form: legacy purchase inputs only when the item already has them', () => {
  assert.ok(!labels(buildItemFormBlueprint(true)).includes('Datos de compra heredados'))
  assert.ok(labels(buildItemFormBlueprint(true, { showLegacyPurchase: true })).includes('Datos de compra heredados'))
})
