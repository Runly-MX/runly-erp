import { createPurchaseEconomicMode, isDocumentary, assertDocumentaryInput, DOCUMENTARY_FIELDS } from './purchase-economic-mode.js'
// runly.purchases — audited corrections of registered orders and invoices.
// One transaction: lock the document row, check the version the user saw,
// validate the fields against purchase-corrections-rules.js, update the
// document (its version is bumped by guardedUpdate) and insert the revision
// with before/after, reason and actor. Revisions are immutable history.
import { publishDomainEvent } from './domain-events/events.js'
import { purchaseEventPayload } from './purchase-documents-service.js'
import { correctionPlan, validateCorrection } from './purchase-corrections-rules.js'
import {
  KINDS, PurchasesServiceError, asDate, dateKey, assertSupplier, assertExpected, broadcast, cleanText, currentVersion, guardedUpdate, notFound, num, plain, versionsAvailable, writeAudit,
} from './purchases-shared.js'

const CORRECTABLE_KINDS = { orders: 'purchases.order.corrected', invoices: 'purchases.invoice.corrected' }

export function createPurchaseCorrectionsService({ prisma, broadcaster, workflowService }) {
  const economics = createPurchaseEconomicMode({ prisma })
  const meta = kind => {
    if (!CORRECTABLE_KINDS[kind]) throw new PurchasesServiceError('Este tipo de documento no admite correcciones.', 400, 'VALIDATION')
    return KINDS[kind]
  }

  // Context the rules need: an order's payment terms lock once its invoices have payments.
  async function contextFor(client, kind, doc) {
    if (kind !== 'orders') return {}
    const billed = await client.entityRelation.findMany({
      where: { companyId: doc.companyId, sourceType: 'purchase_invoice', targetType: 'purchase_order', targetId: doc.id, relationType: 'BILLED_FROM' },
      select: { sourceId: true },
    })
    if (!billed.length) return { hasPayments: false }
    const paid = await client.purchaseInvoice.count({ where: { companyId: doc.companyId, id: { in: billed.map(row => row.sourceId) }, paidAmount: { gt: 0 } } })
    return { hasPayments: paid > 0 }
  }

  // The correction form of a document (also attached to its detail).
  async function plan(kind, doc, client = prisma) {
    return correctionPlan(kind, doc, await contextFor(client, kind, doc))
  }

  async function assertUniqueNumber(tx, kind, doc, number) {
    const where = kind === 'orders'
      ? { companyId: doc.companyId, number, id: { not: doc.id } }
      : { companyId: doc.companyId, supplierId: doc.supplierId, number, id: { not: doc.id } }
    const taken = await tx[KINDS[kind].model].findFirst({ where, select: { id: true } })
    if (taken) {
      throw new PurchasesServiceError(kind === 'orders' ? 'Ya existe otra orden con ese folio.' : 'Ese proveedor ya tiene otra factura con ese folio.', 409, 'DUPLICATE_NUMBER', { field: 'number' })
    }
  }

  // POST /purchases/{orders|invoices}/:id/corrections
  // input: { changes: { field: value }, reason, expectedVersion | expectedUpdatedAt }
  async function correct(kind, companyId, actorId, id, input = {}) {
    const def = meta(kind)
    await workflowService.assertCapability(companyId, def.capability, actorId)
    if (!(await versionsAvailable(prisma))) {
      throw new PurchasesServiceError('Las correcciones todavía no están disponibles en esta instancia.', 409, 'CORRECTIONS_UNAVAILABLE')
    }
    const reason = cleanText(input.reason, 500)
    if (!reason) throw new PurchasesServiceError('Indica el motivo de la corrección.', 400, 'VALIDATION', { field: 'reason' })
    const exists = await prisma[def.model].findFirst({ where: { id, companyId }, select: { id: true } })
    if (!exists) throw notFound()
    const { updated, revision } = await prisma.$transaction(async tx => {
      const [locked] = await tx.$queryRawUnsafe(`SELECT id FROM ${def.entityType} WHERE id = $1::uuid AND company_id = $2::uuid FOR UPDATE`, id, companyId)
      if (!locked) throw notFound()
      const doc = await tx[def.model].findFirst({ where: { id, companyId } })
      const version = await currentVersion(tx, def.entityType, id)
      assertExpected(doc, input, version)
      const documentary = isDocumentary(doc)
      if (documentary && input.expectedVersion == null && !input.expectedUpdatedAt) throw new PurchasesServiceError('Env?a la versión que consultaste.', 422, 'EXPECTED_VERSION_REQUIRED')
      const changes = documentary ? await documentaryChanges(tx, kind, doc, input.changes) : validateCorrection(kind, doc, input.changes, await contextFor(tx, kind, doc))
      if (changes.number) await assertUniqueNumber(tx, kind, doc, changes.number.after)
      const data = Object.fromEntries(Object.entries(changes).filter(([field]) => !['reference', 'description'].includes(field)).map(([field, change]) => [field, change.data]))
      if (changes.reference) await tx.$executeRaw`UPDATE purchase_documentary_reference SET reference = ${changes.reference.after} WHERE company_id = ${companyId}::uuid AND document_id = ${id}::uuid AND document_type = ${def.entityType}`
      if (changes.description) await tx.$executeRaw`UPDATE purchase_documentary_reference SET description = ${changes.description.after} WHERE company_id = ${companyId}::uuid AND document_id = ${id}::uuid AND document_type = ${def.entityType}`
      const fresh = await guardedUpdate(tx, def.model, doc, data)
      const diff = Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, { before: change.before, after: change.after }]))
      const row = await tx.purchaseDocumentRevision.create({
        data: { companyId, documentType: def.entityType, documentId: id, versionFrom: version, versionTo: fresh.version, changes: diff, reason, actorId: actorId || null },
      })
      await writeAudit(tx, {
        companyId, actorId, entityType: def.entityType, entityId: id, action: `${def.entityType.replace('_', '.')}.corrected`,
        before: Object.fromEntries(Object.entries(diff).map(([field, change]) => [field, change.before])),
        after: Object.fromEntries(Object.entries(diff).map(([field, change]) => [field, change.after])),
        metadata: { reason, revisionId: row.id, versionFrom: version, versionTo: fresh.version },
      })
      return { updated: fresh, revision: row }
    })
    await broadcast(broadcaster, companyId, `${def.entityType.replace('_', '.')}.corrected`, { id, caseId: updated.caseId, version: updated.version })
    await publishDomainEvent(prisma, { companyId, event: CORRECTABLE_KINDS[kind], payload: purchaseEventPayload(updated) })
    return { document: (await economics.projectMany(companyId, [updated]))[0], version: updated.version, revision: await serialize(revision) }
  }

  async function documentaryChanges(tx, kind, doc, input = {}) {
    assertDocumentaryInput(input)
    const allowed = doc.status === 'CANCELLED' ? ['notes'] : DOCUMENTARY_FIELDS.filter(field => kind === 'orders' ? field !== 'fiscalUuid' : field !== 'expectedDate')
    const metadata = await economics.metadata(doc.companyId, [doc.id], tx)
    const changes = {}
    for (const [field, raw] of Object.entries(input)) {
      if (!allowed.includes(field)) throw new PurchasesServiceError('Campo no corregible en este documento.', 422, 'FIELD_NOT_CORRECTABLE', { field })
      let value = cleanText(raw, field === 'reference' ? 255 : ['notes', 'description'].includes(field) ? 2000 : 100)
      if (field === 'reference' && !value) throw new PurchasesServiceError('La referencia es obligatoria.', 422, 'VALIDATION')
      if (field === 'supplierId') { value = raw || null; await assertSupplier(tx, doc.companyId, value) }
      if (field === 'issueDate' || field === 'expectedDate') value = asDate(raw)
      const before = ['reference', 'description'].includes(field) ? metadata.get(doc.id)?.[field] ?? null : doc[field] ?? null
      const oldValue = before instanceof Date ? dateKey(before) : before
      const after = value instanceof Date ? dateKey(value) : value
      if (oldValue !== after) changes[field] = { before: oldValue, after, data: value }
    }
    if (!Object.keys(changes).length) throw new PurchasesServiceError('No hay cambios para guardar.', 422, 'NO_CHANGES')
    return changes
  }

  async function serialize(row, names = null) {
    const lookup = names ?? await actorNames([row.actorId])
    return { ...row, actorName: lookup.get(row.actorId) ?? null }
  }

  async function actorNames(ids) {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return new Map()
    const rows = await prisma.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } })
    return new Map(rows.map(row => [row.id, row.displayName]))
  }

  // GET /purchases/{orders|invoices}/:id/revisions — history, readable with the capability off.
  async function revisions(kind, companyId, id) {
    const def = meta(kind)
    const doc = await prisma[def.model].findFirst({ where: { id, companyId } })
    if (!doc) throw notFound()
    const available = await versionsAvailable(prisma)
    const rows = available
      ? await prisma.purchaseDocumentRevision.findMany({ where: { companyId, documentType: def.entityType, documentId: id }, orderBy: { versionTo: 'desc' } })
      : []
    const names = await actorNames(rows.map(row => row.actorId))
    return {
      available,
      version: await currentVersion(prisma, def.entityType, id),
      revisions: await Promise.all(rows.map(row => serialize(row, names))),
      economicMode: isDocumentary(doc) ? 'DOCUMENTARY' : 'FINANCIAL',
      totals: { total: doc.total == null ? null : num(doc.total), currency: isDocumentary(doc) ? null : doc.currency },
    }
  }

  return { correct, revisions, plan }
}
