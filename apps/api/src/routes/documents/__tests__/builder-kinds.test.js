import test from 'node:test'
import assert from 'node:assert/strict'
import { createKindRegistry } from '../kinds/kind-registry.js'
import { createBuilderDocumentKind, createBuilderKindSync } from '../kinds/builder-kinds.js'

const SPEC = { name: 'factura', label: 'Factura', model: 'factura', permission: 'facturas.factura.read', fields: [{ tag: 'folio', label: 'Folio', type: 'text' }, { tag: 'pagada', label: 'Pagada', type: 'text' }] }
const ID = '0190f2c4-0000-7000-8000-000000000001'

test('sync registers kinds of enabled modules and unregisters them when the module goes away', async () => {
  const kinds = createKindRegistry()
  let modules = [{ key: 'custom.facturas', manifest: { documentKinds: [SPEC] } }, { key: 'custom.otro', manifest: {} }]
  const sync = createBuilderKindSync({ prisma: { runlyModule: { findMany: async () => modules } }, kinds })
  assert.deepEqual((await sync.sync()).registered, ['custom.facturas.factura'])
  const kind = kinds.getKind('custom.facturas.factura')
  assert.equal(kind.moduleKey, 'custom.facturas')
  assert.equal(kind.permissionKey, 'facturas.factura.read')
  assert.deepEqual(kind.schema.map((f) => f.tag), ['folio', 'pagada'])
  await sync.sync() // idempotent
  modules = []
  assert.deepEqual((await sync.sync()).removed, ['custom.facturas.factura'])
  assert.equal(kinds.getKind('custom.facturas.factura'), null)
})

test('sync never shadows a built-in kind and skips malformed specs', async () => {
  const kinds = createKindRegistry()
  kinds.register({ key: 'custom.facturas.factura', label: 'Propia', permissionKey: 'x', schema: [], load: async () => ({}) })
  const sync = createBuilderKindSync({ prisma: { runlyModule: { findMany: async () => [{ key: 'custom.facturas', manifest: { documentKinds: [SPEC, { name: 'mala', model: 'Bad Name', fields: [], permission: 'p' }] } }] } }, kinds })
  assert.deepEqual((await sync.sync()).registered, [])
  assert.equal(kinds.getKind('custom.facturas.factura').label, 'Propia')
})

test('load reads only the declared tags of the record in the active company', async () => {
  const queries = []
  const prisma = {
    runlyModel: { findFirst: async () => ({ tableName: 'facturas_factura' }) },
    $queryRawUnsafe: async (sql, ...params) => { queries.push({ sql, params }); return [{ id: ID, folio: 'F-1', pagada: true, secreto: 'x', company_id: 'c1' }] },
  }
  const kind = createBuilderDocumentKind({ prisma, moduleKey: 'custom.facturas', spec: SPEC })
  assert.deepEqual(await kind.load({ companyId: 'c1', sourceId: ID }), { folio: 'F-1', pagada: 'Sí' })
  assert.match(queries[0].sql, /FROM "facturas_factura" WHERE id = \$1::uuid AND company_id = \$2::uuid/)
  assert.deepEqual(queries[0].params, [ID, 'c1'])
  await assert.rejects(kind.load({ companyId: 'c1', sourceId: 'no-es-uuid' }), (e) => e.status === 404)
})

test('load refuses unsafe table names and soft-deleted records', async () => {
  const unsafe = createBuilderDocumentKind({ prisma: { runlyModel: { findFirst: async () => ({ tableName: 'x"; DROP TABLE y;--' }) } }, moduleKey: 'custom.facturas', spec: SPEC })
  await assert.rejects(unsafe.load({ companyId: 'c1', sourceId: ID }), (e) => e.status === 404)
  const gone = createBuilderDocumentKind({ prisma: { runlyModel: { findFirst: async () => ({ tableName: 'facturas_factura' }) }, $queryRawUnsafe: async () => [{ id: ID, enabled: false }] }, moduleKey: 'custom.facturas', spec: SPEC })
  await assert.rejects(gone.load({ companyId: 'c1', sourceId: ID }), (e) => e.status === 404)
})
