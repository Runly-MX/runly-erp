import test from 'node:test'
import assert from 'node:assert/strict'
import { createAttendanceEvents } from '../attendance-events.js'
import { createAttendanceKioskService } from '../attendance-kiosk-service.js'

const membership = (userId, roleKey, perms = []) => ({ userId, role: { key: roleKey, enabled: true, permissions: perms.map((key) => ({ permission: { key } })) } })

test('changed broadcasts attendance.changed to the company channel and never throws', async () => {
  const sent = []
  const events = createAttendanceEvents({ broadcaster: { broadcastToCompany: async (...args) => { sent.push(args) } } })
  events.changed('c1', 'kiosks')
  events.changed(null, 'kiosks')
  assert.deepEqual(sent, [['c1', 'attendance.changed', { action: 'kiosks' }]])
  createAttendanceEvents({ broadcaster: { broadcastToCompany: async () => { throw new Error('down') } } }).changed('c1', 'x')
})

test('a forgotten-punch request notifies admins and people who can resolve it, not other staff', async () => {
  const published = []
  const prisma = { membership: { findMany: async () => [
    membership('admin', 'runly.admin'),
    membership('reviewer', 'custom', ['attendance.punch.manage']),
    membership('viewer', 'custom', ['attendance.view']),
  ] } }
  const events = createAttendanceEvents({ prisma, broadcaster: { broadcastToCompany: async () => {} }, notificationService: { publish: async (args) => { published.push(args) } } })
  await events.correctionRequested({ companyId: 'c1', correction: { id: 'k1', direction: 'out' }, person: { firstName: 'Ana', lastName: 'Paz', code: 'E1' } })
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].input.recipients.userIds.sort(), ['admin', 'reviewer'])
  assert.match(published[0].input.body, /Ana Paz.*salida/)
})

test('roster version moves when a phone key is added but not when a credential is only used', async () => {
  let credentials = { _count: { _all: 1 }, _max: { createdAt: new Date(1000) } }
  const empty = { _count: { _all: 0 }, _max: { updatedAt: null } }
  const agg = async () => empty
  const prisma = {
    attPerson: { aggregate: agg }, attGroup: { aggregate: agg }, attCategory: { aggregate: agg }, attSite: { aggregate: agg },
    attCredential: { aggregate: async () => credentials }, attSettings: { findUnique: async () => null },
  }
  const kiosk = { companyId: 'c1', name: 'K', mode: 'both', requireSelfie: false, allowPin: true, siteId: null }
  const service = () => createAttendanceKioskService({ prisma })
  prisma.attPunch = { findMany: async () => [] }
  const v1 = (await service().changes(kiosk)).rosterVersion
  assert.equal((await service().changes(kiosk)).rosterVersion, v1)
  credentials = { _count: { _all: 2 }, _max: { createdAt: new Date(2000) } }
  assert.notEqual((await service().changes(kiosk)).rosterVersion, v1)
})

test('public router: pairing request and the kiosk change feed', async () => {
  const { createAttendancePublicRouter } = await import('../attendance-public.js')
  const changed = []
  const kiosk = { companyId: 'c9', id: 'k', name: 'K' }
  const service = {
    kioskByLink: async () => kiosk,
    requestPairing: async () => ({ code: '123456', pollSecret: 's', kioskName: 'K' }),
    authenticate: async () => kiosk,
    changes: async () => ({ items: [], rosterVersion: 'v1' }),
  }
  const app = createAttendancePublicRouter({ prisma: {}, service, events: { changed: (...a) => changed.push(a), correctionRequested: async () => {} } })
  const pair = await app.request('/public/attendance/kiosk/L/pair', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
  assert.equal(pair.status, 200)
  assert.deepEqual(changed, [['c9', 'kiosks']])
  const feed = await app.request('/public/attendance/kiosk/L/changes?since=x', { headers: { authorization: 'Kiosk t' } })
  assert.deepEqual((await feed.json()).data, { items: [], rosterVersion: 'v1' })
})
