// Phase 2-3: suppliers (from purchase order / invoice free text) and
// employees (custody receivers) through the toolkit's match-or-create.
import { matchEmployee, nameKey } from '../../../apps/api/src/services/legacy-import/people-and-suppliers.js'
import { collectSuppliers, employeeInput } from './mapping/people.mjs'
import { errorCode } from './migrate-files.mjs'

export async function migrateSuppliers(run, scope) {
  const { model, prisma, companyId } = run
  const docs = [...[...scope.orderIds].map((id) => model.purchaseOrders.get(id)), ...[...scope.invoiceIds].map((id) => model.invoices.get(id))]
  const suppliers = collectSuppliers(docs)
  const ids = new Map()
  const refs = await run.refs.findMany('contact_supplier', [...suppliers.keys()])
  let contacts = null
  for (const [legacyId, name] of suppliers) {
    try {
      if (refs.has(legacyId)) { ids.set(legacyId, refs.get(legacyId)); run.report.count('suppliers', 'matched'); continue }
      if (!run.commit) {
        contacts ??= await prisma.contact.findMany({ where: { companyId, enabled: true }, select: { id: true, name: true, legalName: true } })
        const wanted = nameKey(name)
        const match = contacts.find((row) => nameKey(row.name) === wanted || (row.legalName && nameKey(row.legalName) === wanted))
        ids.set(legacyId, match?.id ?? `dry:supplier:${legacyId}`)
        run.report.count('suppliers', match ? 'matched' : 'created')
        continue
      }
      const result = await run.toolkit.matchOrCreateSupplier({ companyId, actorId: run.actorId, source: run.sourceName, legacyId, name })
      ids.set(legacyId, result.id)
      run.report.count('suppliers', result.created ? 'created' : 'matched')
    } catch (error) {
      run.report.error('suppliers', errorCode('SUPPLIER', error), legacyId)
    }
  }
  return ids
}

// userIds: sinabe user ids of custody receivers. Returns Map<sinabeUserId, employeeId>.
export async function migrateEmployees(run, userIds) {
  const { model, prisma, companyId } = run
  const ids = new Map()
  const wanted = [...new Set(userIds)].filter(Boolean)
  const refs = await run.refs.findMany('hr_employee', wanted)
  let candidates = null
  for (const userId of wanted) {
    const user = model.users.get(userId)
    try {
      if (!user) { run.report.conflict('employees', 'USER_NOT_FOUND', userId); continue }
      if (refs.has(userId)) { ids.set(userId, refs.get(userId)); run.report.count('employees', 'matched'); continue }
      const input = employeeInput(user)
      if (!run.commit) {
        candidates ??= await prisma.hrEmployee.findMany({
          where: { companyId, enabled: true }, select: { id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true, personalEmail: true }, orderBy: { createdAt: 'asc' },
        })
        const match = matchEmployee(candidates, input)
        if (match?.ambiguous) run.report.warn('EMPLOYEE_MATCH_AMBIGUOUS')
        ids.set(userId, match?.employee.id ?? `dry:employee:${userId}`)
        run.report.count('employees', match ? 'matched' : 'created')
        continue
      }
      const result = await run.toolkit.matchOrCreateEmployee({ companyId, actorId: run.actorId, source: run.sourceName, ...input })
      if (result.ambiguous) run.report.warn('EMPLOYEE_MATCH_AMBIGUOUS')
      if (result.matchedBy && result.matchedBy !== 'legacyRef') run.report.warn(`EMPLOYEE_MATCHED_BY_${result.matchedBy.toUpperCase()}`)
      ids.set(userId, result.id)
      run.report.count('employees', result.created ? 'created' : 'matched')
    } catch (error) {
      run.report.error('employees', errorCode('EMPLOYEE', error), userId)
    }
  }
  return ids
}
