import test from 'node:test'
import assert from 'node:assert/strict'
import { componentBlocksFrom, createSyncedComponents, websiteComponentsTransport } from '../syncedComponents.js'

const footer = { name: 'Pie', section: { type: 'ContainerBlock', props: {}, children: {} } }

test('loads definitions and sends the loaded revision with every save, then adopts the new one', async () => {
  const puts = []
  const adapter = createSyncedComponents({
    load: async () => ({ components: { footer }, draftRevision: 7 }),
    put: async (body) => { puts.push(body); return { components: body.components, draftRevision: 8 } },
  })
  assert.deepEqual(adapter.definitions, {})
  await adapter.refresh()
  assert.deepEqual(adapter.definitions, { footer })
  await adapter.save({ footer, extra: footer })
  await adapter.save({ footer })
  assert.deepEqual(puts.map((p) => p.expectedRevision), [7, 8])
  assert.equal(adapter.revision, 8)
  assert.deepEqual(Object.keys(adapter.definitions), ['footer'])
})

test('translates revision conflicts and in-use removals into actionable messages and keeps the old state', async () => {
  let fail
  const adapter = createSyncedComponents({ load: async () => ({ components: { footer }, draftRevision: 3 }), put: async () => { throw fail } })
  await adapter.refresh()
  fail = Object.assign(new Error('x'), { status: 409, code: 'revision_conflict' })
  await assert.rejects(adapter.save({}), /El sitio cambió/)
  fail = Object.assign(new Error('x'), { status: 409, code: 'component_in_use' })
  await assert.rejects(adapter.save({}), /sigue en uso/)
  fail = new Error('Sin permiso')
  await assert.rejects(adapter.save({}), /Sin permiso/)
  assert.deepEqual(adapter.definitions, { footer })
  assert.equal(adapter.revision, 3)
})

test('notifies listeners after load and save', async () => {
  const seen = []
  const adapter = createSyncedComponents({ load: async () => ({ components: {}, draftRevision: 1 }), put: async (b) => ({ components: b.components, draftRevision: 2 }) }, (s) => seen.push(s.revision))
  await adapter.refresh(); await adapter.save({ footer })
  assert.deepEqual(seen, [1, 2])
})

test('the HTTP transport unwraps the data envelope and uses an idempotency key on writes', async () => {
  const calls = []
  const apiFetch = async (path, token, options) => { calls.push({ path, token, options }); return { data: { components: {}, draftRevision: 4 } } }
  const transport = websiteComponentsTransport({ apiFetch, token: 't', siteId: 'site-1' })
  assert.deepEqual(await transport.load(), { components: {}, draftRevision: 4 })
  await transport.put({ components: {}, expectedRevision: 4 })
  assert.equal(calls[0].path, '/website/sites/site-1/components')
  assert.equal(calls[1].options.method, 'PUT')
  assert.ok(calls[1].options.headers['Idempotency-Key'].length >= 16)
  assert.deepEqual(JSON.parse(calls[1].options.body), { components: {}, expectedRevision: 4 })
})

test('older Atlas releases (without ComponentRefBlock) simply have no component blocks', () => {
  assert.deepEqual(componentBlocksFrom({}), [])
  assert.deepEqual(componentBlocksFrom(undefined), [])
  const block = { type: 'ComponentRefBlock' }
  assert.deepEqual(componentBlocksFrom({ ComponentRefBlock: block }), [block])
})
