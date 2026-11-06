import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioDataProviders } from './studio-data-providers.js'

const context = permissions => {
  const values = { companyId: 'c1', userContext: { isAdmin: false, permissionSet: new Set(permissions) } }
  return { get: key => values[key] }
}
const providers = createStudioDataProviders({
  prisma: { invLocation: { findMany: async () => [{ id: 'l1', name: 'Bodega' }] } },
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
  assert.ok(!plain.headers.includes('Enlace público'))
  const linked = await providers.rows(context(['inventory.item.read', 'inventory.label.print']), 'inventory', {})
  assert.equal(linked.rows[0]['Enlace público'], 'https://app.example.com/app/p/inv/tok')
})
