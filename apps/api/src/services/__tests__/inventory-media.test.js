import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediaWhere, listInventoryMedia } from '../inventory-media.js'

test('mediaWhere scopes to the company and filters by kind and search', () => {
  assert.deepEqual(mediaWhere('c1').item, { companyId: 'c1', enabled: true })
  assert.deepEqual(mediaWhere('c1', { kind: 'image' }).fileAsset.mimeType, { startsWith: 'image/' })
  assert.deepEqual(mediaWhere('c1', { kind: 'file' }).fileAsset.NOT, { mimeType: { startsWith: 'image/' } })
  assert.equal(mediaWhere('c1', { search: ' cam ' }).OR.length, 4)
  assert.equal(mediaWhere('c1').OR, undefined)
})

test('listInventoryMedia clamps the page size and flattens rows', async () => {
  const calls = []
  const createdAt = new Date('2026-10-01')
  const prisma = {
    invItemFile: {
      findMany: async (args) => {
        calls.push(args)
        return [{ id: 'r1', fileAssetId: 'f1', label: null, isCover: false, createdAt, fileAsset: { originalName: 'foto.jpg', mimeType: 'image/jpeg', sizeBytes: 10n }, item: { id: 'i1', name: 'Cámara', assetTag: 'T-1' } }]
      },
      count: async () => 1,
    },
  }
  const result = await listInventoryMedia(prisma, 'c1', { pageSize: '9999', sort: 'asc' })
  assert.equal(calls[0].take, 200)
  assert.equal(calls[0].orderBy[0].createdAt, 'asc')
  assert.deepEqual(result.data[0], { id: 'r1', fileAssetId: 'f1', name: 'foto.jpg', originalName: 'foto.jpg', mimeType: 'image/jpeg', sizeBytes: 10, createdAt, isCover: false, itemId: 'i1', itemName: 'Cámara', assetTag: 'T-1' })
  assert.deepEqual(result.pagination, { page: 1, pageSize: 200, total: 1 })
})
