import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createHomeWidgetsRouter } from '../home-widgets-routes.js'

function app({ isAdmin = false, permissions = [], disabledFor = false }) {
  const widgets = [
    { key: 'a', label: 'A', kind: 'count', model: 'orden', permission: 'ordenes.orden.read' },
    { key: 'b', label: 'B', kind: 'count', model: 'orden', permission: 'ordenes.orden.secret' },
  ]
  const prisma = {
    runlyModule: { findMany: async () => [{ id: 'm1', key: 'custom.ordenes', name: 'Órdenes', manifest: { homeWidgets: widgets } }] },
    companyModule: { findMany: async () => (disabledFor ? [{ moduleId: 'm1' }] : []) },
  }
  const host = new Hono()
  host.use('*', async (c, next) => { c.set('companyId', 'c1'); c.set('userContext', { isAdmin, permissionSet: new Set(permissions) }); await next() })
  host.route('/', createHomeWidgetsRouter({ prisma, requireActiveCompany: async (c, next) => next() }))
  return host
}

test('a person only sees the widgets whose permission they hold', async () => {
  const body = await (await app({ permissions: ['ordenes.orden.read'] }).request('/home-widgets')).json()
  assert.deepEqual(body.data.map((w) => w.key), ['a'])
  assert.equal((await app({ permissions: ['ordenes.orden.read'] }).request('/home-widgets/custom.ordenes/b')).status, 404)
  assert.deepEqual((await (await app({ isAdmin: true }).request('/home-widgets')).json()).data.map((w) => w.key), ['a', 'b'])
})

test('a module switched off for the company contributes nothing', async () => {
  assert.deepEqual((await (await app({ isAdmin: true, disabledFor: true }).request('/home-widgets')).json()).data, [])
})
