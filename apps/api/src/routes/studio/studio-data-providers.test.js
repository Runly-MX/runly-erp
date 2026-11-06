import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioDataProviders } from './studio-data-providers.js'

const PHOTO = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const context = permissions => {
  const values = { companyId: 'c1', userContext: { isAdmin: false, permissionSet: new Set(permissions) } }
  return { get: key => values[key] }
}
const providers = createStudioDataProviders({
  prisma: {
    invLocation: { findMany: async () => [{ id: 'l1', name: 'Bodega' }] },
    // Only the company's own image files are signed.
    fileAsset: { findMany: async ({ where }) => (where.entityId === 'c1' ? where.id.in.filter(id => id === PHOTO).map(id => ({ id, bucket: 'b', objectKey: 'k' })) : []) },
    contact: { findMany: async () => [{ id: 'k1', name: 'Acme', addresses: [{ street: 'Reforma', extNumber: '10', postalCode: '06600', city: 'CDMX', state: 'CDMX' }] }], count: async () => 1 },
  },
  hr: { listEmployees: async ({ page }) => ({ rows: page === 1 ? [{ id: 'e1', full_name: 'Ana Ruiz', employee_code: '7', photo_file_id: PHOTO }] : [], total: 1 }) },
  signFile: async () => 'https://storage.example.com/signed',
  inventory: { listItems: async ({ page }) => ({ data: page === 1 ? [{ id: 'i1', name: 'Laptop', assetTag: 'A-1', status: 'available', locationName: 'Bodega' }] : [], total: 1 }) },
  inventoryScope: { fromContext: async () => null },
  inventoryPublic: { ensureTokens: async () => new Map([['i1', 'tok']]), urlFor: (base, token) => `${base}/app/p/inv/${token}` },
  publicBaseUrl: 'https://app.example.com',
  fleet: { listVehicles: async () => ({ data: [], pagination: { total: 0 } }) },
})

test('lists only the modules the user may read', async () => {
  assert.deepEqual((await providers.list(context(['fleet.vehicles.read']))).map(item => item.key), ['fleet'])
  await assert.rejects(providers.rows(context(['fleet.vehicles.read']), 'inventory', {}), /permiso/)
})

test('inventory rows carry the public link only with the print permission', async () => {
  const plain = await providers.rows(context(['inventory.item.read']), 'inventory', { filters: { search: 'lap' } })
  assert.equal(plain.rows[0]['Número de activo'], 'A-1')
  assert.equal(plain.rows[0].Estado, 'Disponible')
  assert.deepEqual(plain.ids, ['i1'])
  assert.ok(!plain.headers.includes('Enlace público'))
  const linked = await providers.rows(context(['inventory.item.read', 'inventory.label.print']), 'inventory', {})
  assert.equal(linked.rows[0]['Enlace público'], 'https://app.example.com/app/p/inv/tok')
})

test('HR rows carry signed photos; contacts carry the full address', async () => {
  const people = await providers.rows(context(['hr.employee.read']), 'hr', {})
  assert.equal(people.rows[0]['Número de empleado'], '7')
  assert.equal(people.rows[0].Foto, PHOTO)
  assert.deepEqual(people.images, { [PHOTO]: 'https://storage.example.com/signed' })
  assert.ok(!people.headers.some(header => /personal|emergencia/i.test(header)))
  const contacts = await providers.rows(context(['contacts.contacts.read']), 'contacts', {})
  assert.equal(contacts.rows[0]['Dirección completa'], 'Reforma 10, 06600 CDMX, CDMX')
  assert.equal(contacts.rows[0].Foto, '')
})
