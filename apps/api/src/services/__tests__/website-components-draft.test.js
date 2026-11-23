import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebsiteDraftService } from '../website-draft-service.js'
import { expandSyncedComponents } from '../website-release-service.js'

const companyId = '00000000-0000-4000-8000-000000000001', siteId = '00000000-0000-4000-8000-000000000002', actorId = '00000000-0000-4000-8000-000000000004'
const footer = { name: 'Pie', section: { type: 'ContainerBlock', props: {}, children: { children: [{ type: 'TextBlock', props: { text: 'Hecho en Runly' } }] } } }
const ref = (id, componentId) => ({ id, type: 'ComponentRefBlock', props: { componentId } })
const pageDoc = (blocks) => ({ schemaVersion: 1, id: 'p', slug: '/', title: 'p', visibility: 'public', regions: { main: { id: 'main', children: Object.keys(blocks) } }, blocks })

function fixture({ components, pages = [] } = {}) {
  const state = { site: { id: siteId, companyId, enabled: true, draftRevision: 4, name: 'Sitio', siteType: 'website', draftIdentity: components ? { name: 'Sitio', components } : null }, audits: [] }
  const tx = {
    $queryRaw: async () => [{ id: siteId }],
    websiteSite: {
      findFirst: async () => state.site,
      update: async ({ where, data }) => { assert.equal(where.draftRevision, state.site.draftRevision, 'compare-and-swap on the draft revision'); state.site = { ...state.site, ...data, draftRevision: state.site.draftRevision + 1 }; return state.site },
    },
    websitePage: { findMany: async () => pages },
    auditLog: { create: async ({ data }) => { state.audits.push(data) } },
  }
  const prisma = { ...tx, $transaction: async (run) => run(tx) }
  return { state, service: createWebsiteDraftService({ prisma }), args: { companyId, siteId, actorId } }
}

test('components draft: save stores definitions in the draft identity and bumps the site revision', async () => {
  const f = fixture()
  assert.deepEqual(await f.service.getComponents(f.args), { components: {}, draftRevision: 4 })
  const saved = await f.service.saveComponents({ ...f.args, components: { footer }, expectedRevision: 4 })
  assert.deepEqual(saved, { components: { footer }, draftRevision: 5 })
  assert.deepEqual(f.state.site.draftIdentity.components, { footer })
  assert.equal(f.state.site.draftIdentity.name, 'Sitio', 'other identity fields are kept')
  assert.equal(f.state.audits[0].action, 'site.components.save_draft')
  assert.deepEqual((await f.service.getComponents(f.args)).components, { footer })
})

test('components draft: stale revisions, missing revision and invalid definitions are rejected before touching the draft', async () => {
  const f = fixture()
  await assert.rejects(f.service.saveComponents({ ...f.args, components: { footer }, expectedRevision: 3 }), { code: 'revision_conflict', status: 409 })
  await assert.rejects(f.service.saveComponents({ ...f.args, components: { footer } }), { code: 'validation_failed' })
  await assert.rejects(f.service.saveComponents({ ...f.args, components: { 'Bad Id': footer }, expectedRevision: 4 }), { code: 'component_id_invalid' })
  await assert.rejects(f.service.saveComponents({ ...f.args, components: { x: { name: 'x', section: { type: 'NoSuchBlock' } } }, expectedRevision: 4 }), { code: 'block_unknown' })
  await assert.rejects(f.service.saveComponents({ ...f.args, components: { x: { name: 'x', section: { type: 'TextBlock', props: { nope: 1 } } } }, expectedRevision: 4 }), { code: 'prop_unknown' })
  await assert.rejects(f.service.saveComponents({ ...f.args, components: { x: { name: 'x', section: { type: 'ContainerBlock', children: { children: [{ type: 'ComponentRefBlock', props: { componentId: 'y' } }] } } } }, expectedRevision: 4 }))
  assert.equal(f.state.site.draftRevision, 4)
  assert.equal(f.state.audits.length, 0)
})

test('components draft: a definition used by a page draft cannot be removed', async () => {
  const f = fixture({ components: { footer }, pages: [{ id: 'page-1', title: 'Inicio', draftBuilderData: pageDoc({ r: ref('r', 'footer') }) }] })
  await assert.rejects(f.service.saveComponents({ ...f.args, components: {}, expectedRevision: 4 }), (error) => error.code === 'component_in_use' && error.status === 409 && error.details[0].pageIds[0] === 'page-1')
  const kept = await f.service.saveComponents({ ...f.args, components: { footer, extra: footer }, expectedRevision: 4 })
  assert.deepEqual(Object.keys(kept.components), ['footer', 'extra'])
})

test('components release: published pages carry the expanded tree and unresolved references block publication', () => {
  const page = pageDoc({ a: { id: 'a', type: 'TextBlock', props: { text: 'Antes' } }, r: { ...ref('r', 'footer'), props: { componentId: 'footer', overrides: { 'root/children/0': { text: 'Otro pie' } } } } })
  const out = expandSyncedComponents(page, { footer })
  assert.ok(!Object.values(out.blocks).some((b) => b.type === 'ComponentRefBlock'))
  const texts = Object.values(out.blocks).filter((b) => b.type === 'TextBlock').map((b) => b.props.text)
  assert.deepEqual(texts, ['Antes', 'Otro pie'])
  assert.equal(expandSyncedComponents(pageDoc({ a: { id: 'a', type: 'TextBlock' } }), undefined).blocks.a.type, 'TextBlock')
  assert.throws(() => expandSyncedComponents(pageDoc({ r: ref('r', 'gone') }), { footer }), { code: 'component_unresolved', status: 422 })
  assert.throws(() => expandSyncedComponents(pageDoc({ r: ref('r', 'footer') }), undefined), { code: 'component_unresolved' })
})

test('effects survive release expansion untouched, in pages and inside components', () => {
  const effects = { _animation: { preset: 'slide-up', distance: 60, once: false }, _scrollReveal: true, _kenburns: { zoom: 1.2, pan: 'left' }, _pressed: { scale: 0.96 } }
  const definitions = { pie: { name: 'Pie', section: { type: 'ContainerBlock', props: { _parallax: { speed: 0.2 } }, children: { children: [{ type: 'TextBlock', props: { text: 'x', ...effects } }] } } } }
  const page = pageDoc({ a: { id: 'a', type: 'TextBlock', props: { text: 'Antes', ...effects } }, r: ref('r', 'pie') })
  const out = expandSyncedComponents(page, definitions)
  const blocks = Object.values(out.blocks)
  assert.deepEqual(blocks.find((b) => b.id === 'a').props, page.blocks.a.props)
  assert.deepEqual(blocks.find((b) => b.type === 'ContainerBlock').props._parallax, { speed: 0.2 })
  assert.deepEqual(blocks.filter((b) => b.type === 'TextBlock' && b.id !== 'a')[0].props, { text: 'x', ...effects })
})
