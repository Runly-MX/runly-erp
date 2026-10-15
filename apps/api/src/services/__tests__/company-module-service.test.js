import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createCompanyModuleService } from '../company-module-service.js'

function makePrisma({ rows = [], modules = [] } = {}) {
  return {
    runlyModule: { findMany: async () => modules },
    companyModule: {
      findMany: async ({ where }) => rows.filter((r) => r.companyId === where.companyId && (where.enabled === undefined || r.enabled === where.enabled)),
      upsert: async ({ where, update, create }) => {
        const existing = rows.find(
          (r) => r.companyId === where.companyId_moduleId.companyId && r.moduleId === where.companyId_moduleId.moduleId,
        )
        if (existing) {
          Object.assign(existing, update)
          return existing
        }
        const created = { ...create }
        rows.push(created)
        return created
      },
    },
  }
}

describe('company-module-service', () => {
  it('listEnabledModuleIds returns only the enabled module ids for a company', async () => {
    const prisma = makePrisma({
      rows: [
        { companyId: 'c1', moduleId: 'm1', enabled: true },
        { companyId: 'c1', moduleId: 'm2', enabled: false },
        { companyId: 'c2', moduleId: 'm1', enabled: true },
      ],
    })
    const service = createCompanyModuleService({ prisma })
    const ids = await service.listEnabledModuleIds('c1')
    assert.deepEqual([...ids].sort(), ['m1'])
  })

  it('isModuleEnabledForCompany defaults to true when no CompanyModule row exists yet', async () => {
    // Absence must mean "enabled", not "disabled" — a company/module pair
    // created after the backfill migration has no row yet, and nothing
    // should regress for it.
    const prisma = makePrisma({ rows: [] })
    const service = createCompanyModuleService({ prisma })
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'c1', moduleId: 'm9' }), true)
  })

  it('custom modules are disabled by default and enabled only with an explicit row', async () => {
    const modules = [
      { id: 'custom1', key: 'custom.fleet' },
      { id: 'off1', key: 'runly.inventory' },
    ]
    const prisma = makePrisma({ modules, rows: [{ companyId: 'c1', moduleId: 'custom1', enabled: true }] })
    const service = createCompanyModuleService({ prisma })
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'c1', moduleId: 'custom1' }), true)
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'new', moduleId: 'custom1' }), false)
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'new', moduleId: 'off1' }), true)
  })

  it('isModuleEnabledForCompany returns false when explicitly disabled', async () => {
    const prisma = makePrisma({ rows: [{ companyId: 'c1', moduleId: 'm1', enabled: false }] })
    const service = createCompanyModuleService({ prisma })
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'c1', moduleId: 'm1' }), false)
  })

  it('setEnabled upserts the row for that exact (company, module) pair', async () => {
    const prisma = makePrisma({ rows: [] })
    const service = createCompanyModuleService({ prisma })
    await service.setEnabled({ companyId: 'c1', moduleId: 'm1', enabled: false })
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'c1', moduleId: 'm1' }), false)
  })

  it('setEnabled does not affect a different company with the same module', async () => {
    const prisma = makePrisma({ rows: [{ companyId: 'c1', moduleId: 'm1', enabled: true }] })
    const service = createCompanyModuleService({ prisma })
    await service.setEnabled({ companyId: 'c2', moduleId: 'm1', enabled: false })
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'c1', moduleId: 'm1' }), true)
    assert.equal(await service.isModuleEnabledForCompany({ companyId: 'c2', moduleId: 'm1' }), false)
  })
})
