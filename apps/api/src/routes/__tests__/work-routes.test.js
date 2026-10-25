import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createWorkRouter, plainMentions } from '../work-routes.js'

test('mention tokens read as plain @names', () => {
  assert.equal(plainMentions('Hola @[01a10900-0000-7000-8000-0000000fa11a:Ana Pérez]   revisa esto'), 'Hola @Ana Pérez revisa esto')
})

test('mentions are scoped to the caller and flag the unread ones', async () => {
  let sql
  const prisma = { $queryRaw: async (strings, ...values) => {
    sql = { text: strings.join('?'), values }
    return [
      { id: 'm1', conversation_id: 'c1', body: 'a @[p1:Yo] b', created_at: new Date('2026-10-26T10:00:00Z'), conversation_name: null, conversation_type: 'direct', sender_name: 'Ana', last_read_at: new Date('2026-10-26T09:00:00Z') },
      { id: 'm2', conversation_id: 'c2', body: 'x', created_at: new Date('2026-10-26T08:00:00Z'), conversation_name: 'Compras', conversation_type: 'group', sender_name: null, last_read_at: new Date('2026-10-26T09:00:00Z') },
    ]
  } }
  const host = new Hono()
  host.use('*', async (c, next) => { c.set('companyId', 'co1'); c.set('userContext', { profile: { id: 'p1' } }); await next() })
  host.route('/', createWorkRouter({ prisma, requireActiveCompany: async (c, next) => next() }))
  const body = await (await host.request('/work/mentions')).json()
  assert.equal(body.data.unread, 1)
  assert.equal(body.data.items[0].conversation, 'Mensaje directo')
  assert.equal(body.data.items[0].excerpt, 'a @Yo b')
  assert.equal(body.data.items[1].sender, 'Alguien')
  assert.ok(sql.values.includes('co1') && sql.values.includes('p1') && sql.values.includes('%@[p1:%'))
  assert.match(sql.text, /runly_chat_user_access/)
})
