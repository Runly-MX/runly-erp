// Per-company module enablement. RunlyModule stays the instance-wide "is this
// module installed on this deployment" catalog; CompanyModule adds the
// missing per-tenant dimension: a company only sees a module in
// /runtime/modules and /blueprints when it's both globally INSTALLED and
// enabled for the company.
//
// Defaults differ by origin:
// - Official/core modules: absence of a CompanyModule row means enabled
//   (nothing regresses for companies that existed before this feature).
// - Custom modules (not in the official manifests): absence means DISABLED. A
//   custom module is only active in the company that installed it (or where an
//   admin enabled it), so new companies never inherit another company's modules.
// Spec: docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §9.4

import { isOfficialModuleKey } from './module-manifests-service.js'

export function createCompanyModuleService({ prisma }) {
  async function listEnabledModuleIds(companyId) {
    const rows = await prisma.companyModule.findMany({
      where: { companyId, enabled: true },
      select: { moduleId: true },
    })
    return new Set(rows.map((r) => r.moduleId))
  }

  async function listDisabledModuleIds(companyId) {
    const [rows, modules] = await Promise.all([
      prisma.companyModule.findMany({ where: { companyId }, select: { moduleId: true, enabled: true } }),
      prisma.runlyModule.findMany({ where: { status: 'INSTALLED', core: false }, select: { id: true, key: true } }),
    ])
    const byModuleId = new Map(rows.map((r) => [r.moduleId, r.enabled]))
    const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.moduleId))
    for (const mod of modules) {
      if (!byModuleId.has(mod.id) && !isOfficialModuleKey(mod.key)) disabled.add(mod.id)
    }
    return disabled
  }

  async function isModuleEnabledForCompany({ companyId, moduleId }) {
    const disabled = await listDisabledModuleIds(companyId)
    return !disabled.has(moduleId)
  }

  async function setEnabled({ companyId, moduleId, enabled }) {
    return prisma.companyModule.upsert({
      where: { companyId_moduleId: { companyId, moduleId } },
      update: { enabled },
      create: { companyId, moduleId, enabled },
    })
  }

  async function listForCompany(companyId) {
    return prisma.companyModule.findMany({ where: { companyId } })
  }

  return { listEnabledModuleIds, listDisabledModuleIds, isModuleEnabledForCompany, setEnabled, listForCompany }
}
