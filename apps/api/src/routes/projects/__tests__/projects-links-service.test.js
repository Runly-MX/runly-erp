import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createLinksService, LinkServiceError } from '../projects-links-service.js'

const TARGET = '0190aaaa-0000-7000-8000-000000000001'
const base = { taskId: 't-1', projectId: 'p-1', companyId: 'co-1', userId: 'u-1', authUserId: 'a-1', targetType: 'vehicle', targetId: TARGET }

function makeService({ resolved = new Map([[TARGET, { title: 'Camion 7' }]]), taskExists = true } = {}) {
  const links = []
  const prisma = {
    task: { findFirst: async () => (taskExists ? { id: 't-1' } : null) },
    taskLink: {
      findFirst: async ({ where }) => links.find((l) => l.id === where.id || (l.taskId === where.taskId && l.targetId === where.targetId)) ?? null,
      findMany: async ({ where }) => links.filter((l) => l.companyId === where.companyId),
      create: async ({ data }) => { const l = { id: `l-${links.length}`, ...data }; links.push(l); return l },
      delete: async ({ where }) => { links.splice(links.findIndex((l) => l.id === where.id), 1) },
    },
  }
  const calls = []
  const relationTargets = { resolve: async (args) => { calls.push(args); return resolved } }
  return { svc: createLinksService({ prisma, relationTargets }), links, calls }
}

describe('links service', () => {
  it('creates a link with the resolved label', async () => {
    const { svc, links, calls } = makeService()
    const link = await svc.addLink(base)
    assert.equal(link.label, 'Camion 7')
    assert.equal(links.length, 1)
    assert.equal(calls[0].type, 'vehicle')
    assert.equal(calls[0].companyId, 'co-1')
  })

  it('rejects duplicates, invisible records and invalid ids', async () => {
    const dup = makeService()
    await dup.svc.addLink(base)
    await assert.rejects(dup.svc.addLink(base), (e) => e instanceof LinkServiceError && e.status === 409)

    const hidden = makeService({ resolved: new Map() })
    await assert.rejects(hidden.svc.addLink(base), (e) => e.status === 404)

    await assert.rejects(makeService().svc.addLink({ ...base, targetId: 'nope' }), (e) => e.status === 400)
    await assert.rejects(makeService({ taskExists: false }).svc.addLink(base), (e) => e.status === 404)
  })

  it('maps relation-targets permission errors to their status', async () => {
    const { svc } = makeService()
    const prisma = { task: { findFirst: async () => ({ id: 't-1' }) }, taskLink: {} }
    const denied = createLinksService({
      prisma,
      relationTargets: { resolve: async () => { const e = new Error('Sin permiso.'); e.status = 403; throw e } },
    })
    await assert.rejects(denied.addLink(base), (e) => e instanceof LinkServiceError && e.status === 403)
    assert.ok(svc)
  })

  it('removes only links of the given task', async () => {
    const { svc } = makeService()
    const link = await svc.addLink(base)
    await assert.rejects(svc.removeLink('missing', 't-1'), (e) => e.status === 404)
    await svc.removeLink(link.id, 't-1')
  })

  it('lists tasks by target flattening the task data', async () => {
    const { svc, links } = makeService()
    links.push({ id: 'l-9', companyId: 'co-1', task: { id: 't-1', title: 'Revisar' } })
    const rows = await svc.listTasksByTarget({ companyId: 'co-1', userId: 'u-1', authUserId: 'a-1', targetType: 'vehicle', targetId: TARGET })
    assert.deepEqual(rows, [{ linkId: 'l-9', id: 't-1', title: 'Revisar' }])
  })
})
