import test from 'node:test'
import assert from 'node:assert/strict'
import { windowStart, normalizeDigestPref, groupDigestItems, renderDigest, createNotificationDigestService } from '../notification-digest-service.js'

const utc = (iso) => new Date(iso).getTime()

test('preferences are normalised: unknown mode is off, bad hour and timezone fall back', () => {
  assert.deepEqual(normalizeDigestPref(null), { mode: 'off', hour: 8, weekday: 1, timezone: 'UTC' })
  assert.deepEqual(normalizeDigestPref({ mode: 'daily', hour: 25, weekday: 9, timezone: 'Mars/Base' }), { mode: 'daily', hour: 8, weekday: 1, timezone: 'UTC' })
})

test('daily window is the most recent hour:00 in the person time zone', () => {
  const pref = { mode: 'daily', hour: 8, timezone: 'America/Mexico_City' } // UTC-6 all year since 2022
  // 15:00 UTC = 09:00 in Mexico City: today's 08:00 (14:00 UTC) has passed.
  assert.equal(windowStart(utc('2026-11-04T15:00:00Z'), pref), utc('2026-11-04T14:00:00Z'))
  // 12:00 UTC = 06:00 local: still yesterday's slot.
  assert.equal(windowStart(utc('2026-11-04T12:00:00Z'), pref), utc('2026-11-03T14:00:00Z'))
  assert.equal(windowStart(utc('2026-11-04T12:00:00Z'), { mode: 'off' }), null)
})

test('weekly window goes back to the chosen weekday', () => {
  const pref = { mode: 'weekly', hour: 9, weekday: 1, timezone: 'UTC' } // Mondays 09:00
  // Wed 2026-11-04 -> Mon 2026-11-02 09:00
  assert.equal(windowStart(utc('2026-11-04T10:00:00Z'), pref), utc('2026-11-02T09:00:00Z'))
  // Monday before the hour -> the previous Monday
  assert.equal(windowStart(utc('2026-11-02T08:00:00Z'), pref), utc('2026-10-26T09:00:00Z'))
  assert.equal(windowStart(utc('2026-11-02T09:00:00Z'), pref), utc('2026-11-02T09:00:00Z'))
})

test('items group by module, biggest first, capped with a "more" count', () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, eventType: 'chat.message.new', title: `Mensaje ${i}` })),
    { id: 'p1', eventType: 'projects.task.assigned', title: 'Tarea' },
    { id: 'x', eventType: 'weird.thing', title: 'Otro' },
  ]
  const groups = groupDigestItems(items)
  assert.deepEqual(groups.map((g) => [g.label, g.total, g.items.length]), [['Chat', 10, 8], ['Otros', 1, 1], ['Proyectos', 1, 1]])
})

test('the email escapes content and says what is pending', () => {
  const mail = renderDigest({ groups: groupDigestItems([{ id: '1', eventType: 'chat.mention.new', title: '<b>Hola</b>', link: '/app/m/runly.chat' }]), total: 1, pendingTasks: 3, appBaseUrl: 'https://app.example.com/', mode: 'daily' })
  assert.match(mail.subject, /Resumen del día: 1 aviso sin ver/)
  assert.ok(!mail.html.includes('<b>Hola</b>'))
  assert.match(mail.html, /3<\/strong> tareas pendientes/)
  assert.match(mail.html, /https:\/\/app\.example\.com\/app\/m\/runly\.chat/)
  assert.match(mail.text, /Tareas pendientes para hoy o vencidas: 3/)
})

function fakePrisma({ prefs, notifications = [], state = {} }) {
  const writes = []
  return {
    writes,
    userPreference: {
      findMany: async () => prefs,
      findUnique: async ({ where }) => (where.userId_key.key.endsWith('.state') ? (state[where.userId_key.userId] ? { value: state[where.userId_key.userId] } : null) : null),
      upsert: async ({ where, create }) => { writes.push(create); if (where.userId_key.key.endsWith('.state')) state[where.userId_key.userId] = create.value },
    },
    notification: { findMany: async () => notifications },
    task: { count: async () => 2 },
  }
}

test('a due digest is sent once per window and not repeated', async () => {
  const prisma = fakePrisma({
    prefs: [{ userId: 'u1', value: { mode: 'daily', hour: 8, timezone: 'UTC' }, user: { email: 'ana@example.com', enabled: true } }],
    notifications: [{ id: 'n1', companyId: 'c1', eventType: 'chat.message.new', title: 'Hola', body: null, link: null, createdAt: new Date() }],
  })
  const sent = []
  const service = createNotificationDigestService({ prisma, mailer: { sendEmail: async (mail) => sent.push(mail) }, appBaseUrl: 'https://app.example.com', now: () => new Date('2026-11-04T10:00:00Z') })
  assert.deepEqual(await service.runDue(), { sent: 1, skipped: 0, checked: 1 })
  assert.equal(sent[0].to, 'ana@example.com')
  assert.deepEqual(await service.runDue(), { sent: 0, skipped: 0, checked: 1 })
  assert.equal(sent.length, 1)
})

test('nothing new means no email, and people with the digest off or no email are ignored', async () => {
  const prisma = fakePrisma({
    prefs: [
      { userId: 'u1', value: { mode: 'daily', hour: 8, timezone: 'UTC' }, user: { email: 'ana@example.com', enabled: true } },
      { userId: 'u2', value: { mode: 'off' }, user: { email: 'b@example.com', enabled: true } },
      { userId: 'u3', value: { mode: 'daily', hour: 8, timezone: 'UTC' }, user: { email: null, enabled: true } },
    ],
  })
  const sent = []
  const service = createNotificationDigestService({ prisma, mailer: { sendEmail: async (mail) => sent.push(mail) }, now: () => new Date('2026-11-04T10:00:00Z') })
  assert.deepEqual(await service.runDue(), { sent: 0, skipped: 1, checked: 3 })
  assert.equal(sent.length, 0)
})
