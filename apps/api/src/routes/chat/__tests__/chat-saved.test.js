import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRemindAt, createChatSavedService, MAX_REMINDER_DAYS } from '../chat-saved-service.js'

const now = new Date('2026-11-04T12:00:00Z')

test('reminder dates: empty means none; past, invalid and over a year are refused', () => {
  assert.equal(parseRemindAt(null, now), null)
  assert.equal(parseRemindAt('', now), null)
  assert.equal(parseRemindAt('2026-11-04T13:00:00Z', now).toISOString(), '2026-11-04T13:00:00.000Z')
  assert.throws(() => parseRemindAt('2026-11-04T11:00:00Z', now), /futuro/)
  assert.throws(() => parseRemindAt('nunca', now), /no es válida/)
  assert.throws(() => parseRemindAt(new Date(now.getTime() + (MAX_REMINDER_DAYS + 2) * 86_400_000).toISOString(), now), /un año/)
})

test('due reminders notify once with a link to the message, in-app and push eligible', async () => {
  const published = []
  const prisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join('?')
      if (/UPDATE chat_saved_messages s SET reminded_at/.test(sql)) return [{ id: 's1', user_id: 'u1', company_id: 'c1', message_id: 'm1', conversation_id: 'v1' }]
      if (/SELECT m.body/.test(sql)) return [{ body: 'Hola @[u9:Ana] manda la cotización' }]
      return []
    },
  }
  const service = createChatSavedService({ prisma, notificationService: { publish: async (x) => published.push(x) } })
  assert.deepEqual(await service.processDueReminders(), { due: 1, sent: 1 })
  const input = published[0].input
  assert.equal(input.eventType, 'chat.reminder')
  assert.equal(input.body, 'Hola @Ana manda la cotización')
  assert.equal(input.link, '/app/m/runly.chat/chat/inbox/v1?msg=m1')
  assert.deepEqual(input.recipients.userIds, ['u1'])
})

test('saving a message the person cannot read is a 404', async () => {
  const service = createChatSavedService({ prisma: { $queryRaw: async () => [] } })
  await assert.rejects(() => service.save({ companyId: 'c', profileId: 'p', messageId: 'm' }), (e) => e.status === 404)
})
