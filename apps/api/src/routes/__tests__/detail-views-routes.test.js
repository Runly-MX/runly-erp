import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createDetailViewsRouter } from '../detail-views-routes.js'

function app(permissions) {
  const rows = new Map()
  const prisma = {
    companyDetailView: {
      findUnique: async ({ where }) => rows.get(`${where.companyId_viewKey.companyId}:${where.companyId_viewKey.viewKey}`) ?? null,
      upsert: async ({ where, create, update }) => {
        const id = `${where.companyId_viewKey.companyId}:${where.companyId_viewKey.viewKey}`
        const row = { ...(rows.get(id) ?? create), ...update, updatedAt: new Date() }
        rows.set(id, row)
        return row
      },
      deleteMany: async ({ where }) => { rows.delete(`${where.companyId}:${where.viewKey}`); return { count: 1 } },
    },
  }
  const host = new Hono()
  host.use('*', async (c, next) => { c.set('companyId', 'c1'); c.set('userId', 'u1'); c.set('userContext', { permissionSet: new Set(permissions) }); await next() })
  host.route('/', createDetailViewsRouter({ prisma, requireActiveCompany: async (c, next) => next() }))
  return host
}

const put = (host, schema) => host.request('/detail-views/inventory.item.detail', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schema }) })
const VIEW = { version: 1, sections: [{ id: 'card_1', label: 'Recepción', column: 'main', columns: 2, fields: ['receivedAt'] }], hidden: ['partNumber'] }

test('readers get the stored view; only the write permission can change it', async () => {
  const admin = app(['inventory.item.read', 'inventory.customfield.manage'])
  assert.equal((await put(admin, VIEW)).status, 200)
  assert.deepEqual((await (await admin.request('/detail-views/inventory.item.detail')).json()).data, VIEW)
  const reader = app(['inventory.item.read'])
  assert.equal((await put(reader, VIEW)).status, 403)
  assert.equal((await reader.request('/detail-views/unknown.view')).status, 404)
})

test('invalid schemas are rejected and DELETE restores the default', async () => {
  const admin = app(['inventory.item.read', 'inventory.customfield.manage'])
  assert.equal((await put(admin, { ...VIEW, sections: [{ id: 'x', column: 'left' }] })).status, 400)
  assert.equal((await put(admin, { ...VIEW, extra: true })).status, 400)
  await put(admin, VIEW)
  await admin.request('/detail-views/inventory.item.detail', { method: 'DELETE' })
  assert.equal((await (await admin.request('/detail-views/inventory.item.detail')).json()).data, null)
})
