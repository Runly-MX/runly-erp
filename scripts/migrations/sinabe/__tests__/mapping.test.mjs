import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapStatus, pickCondition, decideAssetTags, dayOf, itemName } from '../mapping/item.mjs'
import { fieldDefinitions, itemCustomValues, SPECIAL_FIELDS, detailsFieldKey } from '../mapping/custom-fields.mjs'
import { normalizeSupplierName, supplierLegacyId, collectSuppliers, employeeInput, delivererFor, parseDeliverersMap } from '../mapping/people.mjs'
import { mapCustodyStatus, orderCustodyRecords, latestCompletedByItem, assignmentMode, custodySnapshot, uniqueCustodyRows } from '../mapping/custody.mjs'
import { auditCommentBody } from '../mapping/audit.mjs'
import { buildModel, buildScope } from '../mapping/index.mjs'
import { buildPlan } from '../plan.mjs'
import { createReport, renderReportMd, RunAborted } from '../report.mjs'

const d = (iso) => new Date(iso)
const UTC = { timeZone: 'UTC' }

test('status ALTA/PROPUESTA/BAJA -> admin status and dates', () => {
  assert.deepEqual(mapStatus({ status: 'ALTA', altaDate: d('2024-03-05T10:00:00Z'), createdAt: d('2024-01-01T00:00:00Z') }, UTC),
    { adminStatus: 'registered', registeredAt: '2024-03-05', deregisteredAt: null, deregistrationReason: null, warnings: [] })
  const proposed = mapStatus({ status: 'PROPUESTA', altaDate: null, createdAt: d('2024-01-02T00:00:00Z') }, UTC)
  assert.equal(proposed.adminStatus, 'deregistration_proposed')
  assert.equal(proposed.registeredAt, '2024-01-02')
  assert.equal(proposed.deregistrationReason, 'other')
  assert.deepEqual(proposed.warnings, ['ALTA_DATE_FROM_CREATED_AT'])
  const baja = mapStatus({ status: 'baja', altaDate: d('2024-05-01T00:00:00Z'), bajaDate: null, updatedAt: d('2024-06-01T00:00:00Z'), createdAt: d('2024-04-01T00:00:00Z') }, UTC)
  assert.equal(baja.adminStatus, 'deregistered')
  assert.equal(baja.deregisteredAt, '2024-06-01')
  assert.deepEqual(baja.warnings, ['BAJA_DATE_FROM_UPDATED_AT'])
  const early = mapStatus({ status: 'BAJA', altaDate: d('2024-05-01T00:00:00Z'), bajaDate: d('2024-04-01T00:00:00Z') }, UTC)
  assert.equal(early.deregisteredAt, '2024-05-01')
  assert.ok(early.warnings.includes('BAJA_BEFORE_ALTA'))
  assert.deepEqual(mapStatus({ status: 'X', altaDate: d('2024-01-01T00:00:00Z') }, UTC).warnings, ['STATUS_UNKNOWN'])
})

test('dates use the source timezone (Mexico City by default)', () => {
  assert.equal(dayOf(d('2024-03-06T02:00:00Z')), '2024-03-05')
  assert.equal(dayOf(d('2024-03-06T02:00:00Z'), 'UTC'), '2024-03-06')
  assert.equal(dayOf(null), null)
})

test('condition priority picks the worst state and keeps the full list', () => {
  assert.deepEqual(pickCondition(['Nuevo', 'en reparacion', 'Obsoleto', 'Usado']), { primary: 'en reparacion', list: ['en reparacion', 'Usado', 'Nuevo', 'Obsoleto'] })
  assert.deepEqual(pickCondition(['Sin Probar', 'Obsoleto']).primary, 'Obsoleto')
  assert.deepEqual(pickCondition([null, '']), { primary: null, list: [] })
})

test('asset tag: unique active number, else unique folio, else deterministic synthetic', () => {
  const tags = decideAssetTags([
    { id: 'aaaaaaaa-1111-4111-8111-111111111111', activeNumber: ' AN-1 ', internalFolio: 'F-1' },
    { id: 'bbbbbbbb-2222-4222-8222-222222222222', activeNumber: 'AN-2', internalFolio: 'F-2' },
    { id: 'cccccccc-3333-4333-8333-333333333333', activeNumber: 'AN-2', internalFolio: 'F-3' },
    { id: 'dddddddd-4444-4444-8444-444444444444', activeNumber: '', internalFolio: 'F-4' },
    { id: 'eeeeeeee-5555-4555-8555-555555555555', activeNumber: null, internalFolio: 'F-4' },
    { id: 'ffffffff-6666-4666-8666-666666666666', activeNumber: null, internalFolio: 'AN-1' },
  ])
  assert.deepEqual(tags.get('aaaaaaaa-1111-4111-8111-111111111111'), { assetTag: 'AN-1', origin: 'activeNumber', warnings: [] })
  assert.equal(tags.get('bbbbbbbb-2222-4222-8222-222222222222').assetTag, 'F-2')
  assert.deepEqual(tags.get('cccccccc-3333-4333-8333-333333333333').warnings, ['ASSET_NUMBER_DUPLICATE', 'ASSET_TAG_FROM_FOLIO'])
  assert.equal(tags.get('dddddddd-4444-4444-8444-444444444444').assetTag, 'SINABE-DDDDDDDD')
  assert.equal(tags.get('eeeeeeee-5555-4555-8555-555555555555').origin, 'synthetic')
  assert.equal(tags.get('ffffffff-6666-4666-8666-666666666666').assetTag, 'SINABE-FFFFFFFF')
  assert.equal(new Set([...tags.values()].map((t) => t.assetTag)).size, 6)
  assert.equal(itemName({ typeName: 'Laptop', brandName: ' Marca ', modelName: null, assetTag: 'X' }), 'Laptop Marca')
  assert.equal(itemName({ assetTag: 'X' }), 'Activo X')
})

test('custom fields keep originals, lists, details and sinabe fields', () => {
  const source = { customFields: [{ id: 3, name: 'Campo', enabled: false }], inventories: [{ details: { 'Color Base': 'Negro', n: 3 } }, { details: 'texto' }] }
  const keys = fieldDefinitions(source).map((f) => f.fieldKey)
  assert.deepEqual(keys, ['sinabe_condiciones', 'sinabe_numero_activo', 'sinabe_folio_interno', 'vertical', 'sinabe_cf_3', 'sinabe_d_color_base', 'sinabe_d_n', 'sinabe_detalles'])
  const values = itemCustomValues({ activeNumber: 'AN-1', internalFolio: ' ', details: { 'Color Base': 'Negro', obj: { a: 1 } } },
    { conditionNames: ['Usado', 'Nuevo'], verticalNames: ['B', 'A', 'B'], customFieldRows: [{ customFieldId: 3, value: 'v' }, { customFieldId: 4, value: '' }] })
  assert.deepEqual(values, [
    { fieldKey: SPECIAL_FIELDS.activeNumber.fieldKey, value: 'AN-1' }, { fieldKey: 'sinabe_condiciones', value: 'Usado, Nuevo' },
    { fieldKey: 'vertical', value: 'A, B' }, { fieldKey: 'sinabe_cf_3', value: 'v' }, { fieldKey: 'sinabe_d_color_base', value: 'Negro' }, { fieldKey: detailsFieldKey('obj'), value: '{"a":1}' },
  ])
})

test('suppliers and people', () => {
  assert.equal(normalizeSupplierName('  Proveedor   Uno, '), 'Proveedor Uno')
  assert.equal(normalizeSupplierName('  '), null)
  assert.equal(supplierLegacyId('PROVEEDOR  Ñandú'), supplierLegacyId('proveedor nandu'))
  assert.equal(collectSuppliers([{ supplier: 'A sa' }, { supplier: 'a SA' }, { supplier: null }]).size, 1)
  const input = employeeInput({ id: 'u1', firstName: ' Ana ', lastName: 'Pérez  López', email: 'ANA@X.TEST', employeeNumber: ' 7 ', department: '', jobTitle: null })
  assert.deepEqual(input, { legacyId: 'u1', employeeNumber: '7', email: 'ana@x.test', firstName: 'Ana', lastName: 'Pérez López', department: null, jobTitle: null })
  const map = parseDeliverersMap({ ' Ana@X.test ': 'p1' })
  assert.deepEqual(delivererFor({ email: 'ana@x.test', firstName: 'Ana' }, map), { delivererId: 'p1', delivererName: null })
  assert.deepEqual(delivererFor({ email: 'otro@x.test', firstName: 'Otro', lastName: 'Uno' }, map), { delivererId: null, delivererName: 'Otro Uno' })
})

test('custody: order, latest completed per item and assignment mode', () => {
  const records = [
    { id: 'r3', status: 'COMPLETADO', date: d('2025-03-01'), enabled: true },
    { id: 'r1', status: 'COMPLETADO', date: d('2025-01-01'), enabled: true },
    { id: 'r2', status: 'BORRADOR', date: d('2025-02-01'), enabled: true },
    { id: 'r0', status: 'COMPLETADO', date: d('2024-01-01'), enabled: false },
  ]
  const ordered = orderCustodyRecords(records)
  assert.deepEqual(ordered.map((r) => r.id), ['r1', 'r2', 'r3'])
  const items = new Map([['r1', [{ inventoryId: 'a' }, { inventoryId: 'b' }]], ['r2', [{ inventoryId: 'b' }]], ['r3', [{ inventoryId: 'b' }]]])
  const latest = latestCompletedByItem(ordered, items)
  assert.deepEqual([...latest], [['a', 'r1'], ['b', 'r3']])
  assert.deepEqual(assignmentMode(records[1], items.get('r1'), latest), { mode: 'partial', itemIds: ['a'] })
  assert.deepEqual(assignmentMode(records[0], items.get('r3'), latest), { mode: 'all', itemIds: ['b'] })
  assert.equal(assignmentMode(records[2], items.get('r2'), latest).mode, 'none')
  assert.equal(mapCustodyStatus('cancelado'), 'CANCELLED')
  assert.deepEqual(custodySnapshot({ typeBrand: 'T', model: '', serialNumber: 'S', assetNumber: 'A', invoiceNumber: null, features: 'F' }), { typeBrand: 'T', serialNumber: 'S', assetTag: 'A', features: 'F' })
  assert.equal(uniqueCustodyRows([{ inventoryId: 'a' }, { inventoryId: 'a' }, { inventoryId: null }]).length, 1)
})

test('audit log becomes a readable comment', () => {
  const body = auditCommentBody({ action: 'UPDATE', changes: '{"comments":{"old":null,"new":"x"}}' }, { firstName: 'Ana', lastName: 'Uno' })
  assert.equal(body, 'Historial sinabe — Actualización por Ana Uno.\nCambios:\n- comments: (vacío) → x')
  assert.equal(auditCommentBody({ action: 'CREATE', changes: null }, null), 'Historial sinabe — Creación.')
})

const tinySource = () => ({
  meta: {}, inventoryTypes: [{ id: 1, name: 'Laptop' }], inventoryBrands: [{ id: 1, name: 'Marca' }], models: [{ id: 1, name: 'M1', typeId: 1, brandId: 1 }],
  locations: [], conditions: [{ id: 1, name: 'Usado' }, { id: 2, name: 'Descompuesto' }], customFields: [], verticals: [{ id: 1, name: 'V' }], modelVerticals: [{ modelId: 1, verticalId: 1 }],
  inventories: [
    { id: 'i1', status: 'ALTA', activeNumber: 'A1', serialNumber: 'S1', modelId: 1, enabled: true, createdAt: d('2024-01-01T12:00:00Z'), altaDate: d('2024-01-01T12:00:00Z'), invoiceId: 'f1', purchaseOrderId: null },
    { id: 'i2', status: 'ALTA', activeNumber: 'A2', modelId: 9, enabled: true, createdAt: d('2024-02-01T12:00:00Z'), altaDate: null, invoiceId: null, purchaseOrderId: null },
  ],
  inventoryConditions: [{ inventoryId: 'i1', conditionId: 1 }, { inventoryId: 'i1', conditionId: 2 }], inventoryCustomFields: [],
  invoices: [{ id: 'f1', code: 'F-1', supplier: 'Prov', purchaseOrderId: 'p1' }], purchaseOrders: [{ id: 'p1', code: 'OC-1', supplier: 'Prov' }, { id: 'p2', code: 'OC-2' }],
  images: [{ id: 'g2', inventoryId: 'i1', url: 'uploads/inventories/images/b.jpg', createdAt: d('2024-01-03'), enabled: true },
    { id: 'g1', inventoryId: 'i1', url: '/uploads/inventories/images/a.jpg', createdAt: d('2024-01-02'), enabled: true },
    { id: 'g3', inventoryId: 'i1', url: 'uploads/inventories/images/thumbnails/a-thumbnail.jpg', createdAt: d('2024-01-04'), enabled: true }],
  files: [{ id: 'x1', inventoryId: 'i1', url: 'uploads/inventories/files/c.pdf', type: 'application/pdf', enabled: true, createdAt: d('2024-01-05') }],
  users: [], custodyRecords: [], custodyItems: [], auditLogs: [{ id: 'l1', entityType: 'INVENTORY', entityId: 'i1' }],
})

test('model maps an item and scopes documents for --only', () => {
  const model = buildModel(tinySource(), { timeZone: 'UTC' })
  const item = model.mapItem(model.inventories[0])
  assert.equal(item.data.name, 'Laptop Marca M1')
  assert.equal(item.data.invoiceNumber, 'F-1')
  assert.equal(item.data.vendorName, 'Prov')
  assert.equal(item.purchaseOrderId, 'p1')
  assert.equal(item.sinabe.condition, 'Descompuesto')
  assert.deepEqual(item.attachments.map((a) => [a.legacyId, a.isCover]), [['image:g1', true], ['image:g2', false], ['file:x1', false]])
  assert.ok(item.warnings.includes('IMAGE_IS_THUMBNAIL') && item.warnings.includes('CONDITIONS_COLLAPSED'))
  assert.ok(model.mapItem(model.inventories[1]).warnings.includes('MODEL_NOT_FOUND'))
  const scope = buildScope(model, ['i1', 'zz'])
  assert.deepEqual([[...scope.invoiceIds], [...scope.orderIds], scope.unknownOnly], [['f1'], ['p1'], 1])
  assert.equal(buildScope(model).orderIds.size, 2)
  const listing = new Map([['inventories/images/a.jpg', { size: 10 }], ['inventories/files/c.pdf', { size: 99 }]])
  const plan = buildPlan(model, { listing, batchSize: 1, maxFileBytes: 50 })
  assert.equal(plan.batches.length, 2)
  assert.deepEqual([plan.totals.files, plan.totals.bytes, plan.totals.missing, plan.totals.oversize], [3, 109, 1, 1])
})

test('report holds codes and ids only and aborts past --max-errors', () => {
  const report = createReport({ command: 'migrate', mode: 'dry-run', source: 's', companyId: 'c', maxErrors: 1 })
  report.count('items', 'created', 2)
  report.conflict('items', 'ASSET_TAG_TAKEN', 'i9')
  report.warn('FILE_MISSING', 3)
  report.error('items', 'ITEM_VALIDATION', 'i8')
  assert.throws(() => report.error('items', 'ITEM_VALIDATION', 'i7'), RunAborted)
  const data = report.toJSON()
  assert.deepEqual(data.entities.items, { created: 2, matched: 0, skipped: 0, conflict: 1, failed: 2 })
  assert.deepEqual(data.conflicts.ASSET_TAG_TAKEN.ids, ['i9'])
  const md = renderReportMd(data)
  assert.match(md, /A crear/)
  assert.match(md, /`i8`, `i7`/)
})

test('file fetch: listing pre-filters, fetch errors are coded and do not throw', async () => {
  const { fetchFile } = await import('../migrate-files.mjs')
  const report = createReport({ command: 'migrate', mode: 'commit', source: 's', companyId: 'c', maxErrors: 5 })
  const fetcher = { fetch: async (key) => { if (key === 'boom') throw Object.assign(new Error('x'), { code: 'FILE_HTTP_ERROR' }); return { buffer: Buffer.from('abc'), sha256: 'h', size: 3 } } }
  const run = { report, fetcher, maxFileBytes: 10, listing: new Map([['ok', { size: 4 }], ['big', { size: 99 }], ['boom', { size: 1 }]]) }
  assert.equal((await fetchFile(run, 'ok', 'itemFiles', 'i1')).size, 3)
  assert.equal(await fetchFile(run, 'gone', 'itemFiles', 'i2'), null)
  assert.equal(await fetchFile(run, 'big', 'itemFiles', 'i3'), null)
  assert.equal(await fetchFile(run, 'boom', 'itemFiles', 'i4'), null)
  const data = report.toJSON()
  assert.deepEqual([data.files.transferred, data.files.sizeMismatches, data.files.missing, data.files.oversize, data.files.fetchErrors], [1, 1, 1, 1, 1])
  assert.deepEqual(Object.keys(data.conflicts).sort(), ['FILE_HTTP_ERROR', 'FILE_TOO_LARGE'])
})
