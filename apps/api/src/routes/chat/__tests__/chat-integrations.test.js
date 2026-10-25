import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIntegrationBody, safeLink, hashToken, createChatIntegrationsService, RATE_PER_MINUTE } from '../chat-integrations-service.js'
import { createChatHandlers } from '../../../services/module-services/chat-services.js'

class ServiceError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code } }

test('the body joins title, text, fields and a safe link; empty messages are refused', () => {
  const body = buildIntegrationBody({ title: 'Deploy *ok*', text: 'Versión 1.2', fields: [{ label: 'Rama', value: 'main' }, { label: '', value: 'x' }], link: 'https://example.com/a' })
  assert.equal(body, '*Deploy ok*\nVersión 1.2\nRama: main\nhttps://example.com/a')
  assert.throws(() => buildIntegrationBody({}), /necesita texto/)
  assert.throws(() => buildIntegrationBody({ link: 'javascript:alert(1)' }), /necesita texto/)
})

test('links keep only http(s) and paths inside Runly', () => {
  assert.equal(safeLink('/app/home'), '/app/home')
  assert.equal(safeLink('//evil.test'), '')
  assert.equal(safeLink('data:text/html,x'), '')
  assert.equal(safeLink('http://a.test/x'), 'http://a.test/x')
})

test('tokens are stored hashed', () => {
  assert.notEqual(hashToken('abc'), 'abc')
  assert.equal(hashToken('abc'), hashToken('abc'))
})

function fakePrisma({ integration = { id: 'i1', name: 'CI', icon: null, conversation_id: 'c1' } } = {}) {
  const calls = []
  const prisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join('?')
      calls.push(sql)
      if (/FROM chat_integrations i/.test(sql)) return integration ? [integration] : []
      if (/INSERT INTO chat_messages/.test(sql)) return [{ id: 'm1', created_at: new Date() }]
      if (/SELECT user_id FROM chat_conversation_members/.test(sql)) return [{ user_id: 'u1' }]
      if (/FROM chat_conversations WHERE/.test(sql)) return [{ id: 'c1', title: 'General' }]
      return []
    },
    $executeRaw: async () => 1,
  }
  return { prisma, calls }
}

test('a valid token posts a system message labelled with the integration', async () => {
  const { prisma, calls } = fakePrisma()
  const sent = []
  const service = createChatIntegrationsService({ prisma, broadcaster: { broadcastToUsers: async (...args) => sent.push(args) } })
  const posted = await service.postFromToken('tok', { text: 'Hola' })
  assert.equal(posted.id, 'm1')
  assert.ok(calls.some((sql) => /INSERT INTO chat_messages/.test(sql)))
  assert.equal(sent[0][1], 'chat.message.new')
})

test('unknown tokens answer 404 and the rate limit answers 429', async () => {
  const none = createChatIntegrationsService({ prisma: fakePrisma({ integration: null }).prisma })
  await assert.rejects(() => none.postFromToken('x', { text: 'a' }), (e) => e.status === 404)
  const service = createChatIntegrationsService({ prisma: fakePrisma().prisma })
  let last
  for (let i = 0; i <= RATE_PER_MINUTE; i += 1) last = await service.postFromToken('tok', { text: 'a' }).catch((e) => e)
  assert.equal(last.status, 429)
})

test('the messages.post service resolves the channel and labels the module', async () => {
  const { prisma } = fakePrisma()
  prisma.runlyModule = { findFirst: async () => ({ name: 'Compras' }) }
  const handlers = createChatHandlers({ prisma, ServiceError })
  const out = await handlers['runly.chat:messages.post']({ companyId: 'co', moduleKey: 'runly.purchases' }, { channel: 'General', text: 'Orden aprobada' })
  assert.equal(out.channel, 'General')
  await assert.rejects(() => handlers['runly.chat:messages.post']({ companyId: 'co', moduleKey: 'm' }, { channel: 'General' }), (e) => e instanceof ServiceError && e.status === 400)
})

import { buildActions, MAX_BUTTONS } from '../chat-integrations-service.js'
import { createChatActionsService } from '../chat-actions-service.js'
import { AutomationApprovalError } from '../../../services/automation-approvals-service.js'

test('link buttons: at most 3, label and safe url required', () => {
  const actions = buildActions({ buttons: [
    { label: 'Ver', url: 'https://example.com' }, { label: '', url: 'https://x.test' }, { label: 'Mal', url: 'javascript:1' },
    { label: 'Panel', url: '/app/home' }, { label: 'Otro', url: 'http://a.test' }, { label: 'Cuarto', url: 'https://d.test' },
  ] })
  assert.deepEqual(actions.map((a) => a.label), ['Ver', 'Panel', 'Otro'])
  assert.ok(actions.length <= MAX_BUTTONS)
  assert.deepEqual(buildActions({}), [])
})

test('an approval id gives the Aprobar / Rechazar pair and ignores other buttons', () => {
  const id = '01a17493-5775-724e-8166-d18392675a09'
  const actions = buildActions({ approvalId: id, buttons: [{ label: 'Ver', url: 'https://example.com' }] })
  assert.deepEqual(actions.map((a) => [a.id, a.decision, a.approvalId]), [['approve', 'approve', id], ['reject', 'reject', id]])
  assert.deepEqual(buildActions({ approvalId: 'no-uuid' }), [])
})

function actionsFixture(metadata, decide) {
  const calls = { updates: 0 }
  const prisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join('?')
      if (/FROM chat_messages m/.test(sql)) return metadata === null ? [] : [{ id: 'm1', conversation_id: 'c1', metadata }]
      if (/FROM user_profile/.test(sql)) return [{ display_name: 'Ana' }]
      return [{ user_id: 'u1' }]
    },
    $executeRaw: async () => { calls.updates += 1 },
  }
  return { service: createChatActionsService({ prisma, approvalsService: { decide } }), calls }
}
const card = { actions: [{ id: 'approve', kind: 'approval', approvalId: 'a1', decision: 'approve', label: 'Aprobar' }, { id: 'link0', kind: 'link', url: '/x', label: 'Abrir' }] }

test('pressing a decision button decides once and records who did', async () => {
  const decided = []
  const { service, calls } = actionsFixture(card, async (x) => decided.push(x))
  const out = await service.perform({ companyId: 'co', profileId: 'p', messageId: 'm1', actionId: 'approve' })
  assert.equal(out.resolution.byName, 'Ana')
  assert.deepEqual([decided[0].id, decided[0].decision, decided[0].profileId], ['a1', 'approve', 'p'])
  assert.equal(calls.updates, 1)
})

test('resolved cards, link buttons, unknown buttons and unreadable messages are refused', async () => {
  const run = (meta, id, decide = async () => {}) => actionsFixture(meta, decide).service.perform({ companyId: 'co', profileId: 'p', messageId: 'm1', actionId: id })
  await assert.rejects(() => run({ ...card, resolution: { by: 1 } }, 'approve'), (e) => e.status === 409)
  await assert.rejects(() => run(card, 'link0'), (e) => e.status === 400)
  await assert.rejects(() => run(card, 'nope'), (e) => e.status === 404)
  await assert.rejects(() => run(null, 'approve'), (e) => e.status === 404)
  await assert.rejects(() => run(card, 'approve', async () => { throw new AutomationApprovalError('Aprobación no encontrada.', 404) }), (e) => e.status === 404 && /no encontrada/.test(e.message))
})
