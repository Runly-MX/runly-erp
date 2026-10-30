import { isDocumentary } from './purchase-economic-mode.js'
// When a purchase case (expediente) can close, and the automatic close used
// by presets that do not expose cases (SIMPLE, BASIC, INVENTORY: the case
// capability gate is off, so nobody can close it by hand).
//
// A case is ready to close when every document in it is final and the
// workflow policy has no unsatisfied requirement before CLOSE. A case whose
// documents were all cancelled is ready to be cancelled instead.
import { policyCheckFor } from './purchase-case-bundle.js'
import { hasCapability } from './purchases-service.js'
import { writeAudit } from './purchases-shared.js'

export const CASE_GATE = ['requests', 'quotes', 'approvals']

const KIND_LABEL = { orders: 'Orden', invoices: 'Factura', requests: 'Solicitud', approvals: 'Aprobación' }

// Final = nothing else is expected from the document. Without the payments
// capability a registered invoice (PENDING) is final: no payment can follow.
export function isFinalDocument(kind, status, capabilities = {}) {
  if (kind === 'orders') return ['CLOSED', 'CANCELLED'].includes(status)
  if (kind === 'invoices') return ['PAID', 'CANCELLED'].includes(status) || (status === 'PENDING' && capabilities.payments !== true)
  if (kind === 'requests') return ['ORDERED', 'REJECTED', 'CANCELLED'].includes(status)
  if (kind === 'approvals') return status !== 'PENDING'
  return true
}

const OPEN_REASON = {
  orders: 'sigue abierta (ciérrala o cancélala)',
  invoices: 'no está registrada o tiene saldo por pagar',
  requests: 'no se ha convertido, rechazado ni cancelado',
  approvals: 'está pendiente de decisión',
}

// caseClosureCheck(workflow, bundle) ->
// { ready, outcome: 'CLOSED' | 'CANCELLED' | null, openDocuments, blockers, automatic }
export function caseClosureCheck(workflow = {}, bundle = {}) {
  const capabilities = workflow.capabilities ?? {}
  const groups = { requests: bundle.requests ?? [], orders: bundle.orders ?? [], invoices: bundle.invoices ?? [], approvals: bundle.approvals ?? [] }
  const openDocuments = []
  for (const [kind, rows] of Object.entries(groups)) {
    for (const row of rows) {
      if (!isDocumentary(row) && !isFinalDocument(kind, row.status, capabilities)) {
        openDocuments.push({ kind, id: row.id, number: row.number ?? null, status: row.status, reason: `${KIND_LABEL[kind]} ${row.number ?? ''} ${OPEN_REASON[kind]}`.replace(/\s+/g, ' ').trim() })
      }
    }
  }
  const documents = [...groups.requests, ...groups.orders, ...groups.invoices]
  const allCancelled = documents.length > 0 && documents.every(row => ['CANCELLED', 'REJECTED'].includes(row.status))
  const check = policyCheckFor(workflow, bundle, 'cases', null)
  const blockers = allCancelled ? [] : check.reasons
  const ready = documents.length > 0 && openDocuments.length === 0 && blockers.length === 0
  return {
    ready,
    outcome: ready ? (allCancelled ? 'CANCELLED' : 'CLOSED') : null,
    openDocuments,
    blockers,
    automatic: !hasCapability(capabilities, CASE_GATE),
  }
}

// Inside the transaction that moved a document: locks the case row (so two
// documents finishing at once are evaluated one after the other), reloads the
// bundle with the transaction client and closes or cancels the case when it
// is ready. Only in automatic mode; returns the new status or null.
export async function autoCloseCase(tx, { workflow, caseBundle, companyId, caseId, actorId, trigger }) {
  if (!caseId || hasCapability(workflow.capabilities, CASE_GATE)) return null
  const [locked] = await tx.$queryRaw`SELECT status FROM purchase_case WHERE id = ${caseId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`
  if (!locked || !['OPEN', 'IN_PROGRESS'].includes(locked.status)) return null
  const bundle = await caseBundle.loadBundle(companyId, caseId, tx)
  // Registration is independent of technical case completion.
  if ([...bundle.orders, ...bundle.invoices].some(isDocumentary)) return null
  const closure = caseClosureCheck(workflow, bundle)
  if (!closure.ready) return null
  const status = closure.outcome
  await tx.purchaseCase.updateMany({ where: { id: caseId, companyId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status, closedAt: status === 'CLOSED' ? new Date() : null } })
  await writeAudit(tx, {
    companyId, actorId, entityType: 'purchase_case', entityId: caseId,
    action: status === 'CLOSED' ? 'purchase.case.auto_closed' : 'purchase.case.auto_cancelled',
    before: { status: locked.status }, after: { status }, metadata: { trigger },
  })
  return status
}
