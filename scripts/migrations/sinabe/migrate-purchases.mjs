// Phase 4-5: purchase orders (CLOSED) and supplier invoices (PAID) with their
// PDF/XML and the fiscal UUID read from the XML.
import { normalizeUploadKey } from './paths.mjs'
import { dayOf } from './mapping/item.mjs'
import { fetchFile, dryFile, errorCode } from './migrate-files.mjs'

const ts = (d) => d?.getTime?.() ?? 0
const byDate = (a, b) => ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id))
const short = (id) => String(id).replace(/-/g, '').slice(0, 8).toUpperCase()
const isReal = (id) => id && !String(id).startsWith('dry:')

const sameText = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

// Notes from sinabe's free text (invoice concept / order description). Users often
// type the code again there; repeating it as a note adds nothing, so it is dropped.
export function noteFor(text, code) {
  const value = String(text ?? '').trim()
  return value && !sameText(value, code) ? value : null
}

export function documentNumber(doc, prefix, report) {
  const code = String(doc.code ?? '').trim()
  if (code) return code
  report.warn(`${prefix}_CODE_MISSING`)
  return `SINABE-${prefix === 'PO' ? 'OC' : 'FAC'}-${short(doc.id)}`
}

async function takenNumbers(prisma, model, companyId, numbers) {
  if (!numbers.length) return new Map()
  const rows = await prisma[model].findMany({ where: { companyId, number: { in: numbers } }, select: { id: true, number: true, supplierId: true } })
  const out = new Map()
  for (const row of rows) { if (!out.has(row.number)) out.set(row.number, []); out.get(row.number).push(row) }
  return out
}

export async function migratePurchaseOrders(run, scope, supplierIds) {
  const { model, companyId } = run
  const orders = [...scope.orderIds].map((id) => model.purchaseOrders.get(id)).sort(byDate)
  const ids = new Map()
  const refs = await run.refs.findMany('purchase_order', orders.map((o) => o.id))
  const numbers = new Map(orders.map((o) => [o.id, documentNumber(o, 'PO', run.report)]))
  const taken = run.commit ? null : await takenNumbers(run.prisma, 'purchaseOrder', companyId, [...numbers.values()])
  const seen = new Set()
  for (const order of orders) {
    const number = numbers.get(order.id)
    try {
      if (refs.has(order.id)) { ids.set(order.id, refs.get(order.id)); run.report.count('purchaseOrders', 'matched'); continue }
      const supplierId = supplierIds.get(model.supplierIdOf(order)) ?? null
      if (!run.commit) {
        if (taken.has(number) || seen.has(number)) { run.report.conflict('purchaseOrders', 'PO_NUMBER_TAKEN', order.id); continue }
        seen.add(number); ids.set(order.id, `dry:po:${order.id}`); run.report.count('purchaseOrders', 'created')
        continue
      }
      const result = await run.toolkit.importPurchaseOrder({
        companyId, actorId: run.actorId, source: run.sourceName, legacyId: order.id, number, status: 'CLOSED',
        issueDate: dayOf(order.createdAt ?? new Date(), run.model.timeZone), createdAt: order.createdAt, closedAt: order.updatedAt ?? order.createdAt,
        supplierId: isReal(supplierId) ? supplierId : null, notes: noteFor(order.description, number),
      })
      if (result.conflict) { run.report.conflict('purchaseOrders', 'PO_NUMBER_TAKEN', order.id); continue }
      ids.set(order.id, result.id)
      run.report.count('purchaseOrders', result.created ? 'created' : 'matched')
    } catch (error) {
      run.report.error('purchaseOrders', errorCode('PO', error), order.id)
    }
  }
  return ids
}

const FILE_KINDS = [['pdf', 'fileUrl', 'application/pdf'], ['xml', 'xmlUrl', 'application/xml']]

export function invoiceFiles(invoice) {
  return FILE_KINDS.map(([label, field, mimeType]) => {
    const key = normalizeUploadKey(invoice[field])
    return key ? { label, key, mimeType, legacyId: `invoice:${invoice.id}:${label}`, fileName: key.split('/').pop() } : null
  }).filter(Boolean)
}

export async function migrateInvoices(run, scope, supplierIds, orderIds) {
  const { model, companyId } = run
  const invoices = [...scope.invoiceIds].map((id) => model.invoices.get(id)).sort(byDate)
  const ids = new Map()
  const refs = await run.refs.findMany('purchase_invoice', invoices.map((i) => i.id))
  const fileRefs = await run.refs.findMany('purchase_file', invoices.flatMap((i) => invoiceFiles(i).map((f) => f.legacyId)))
  const numbers = new Map(invoices.map((i) => [i.id, documentNumber(i, 'INVOICE', run.report)]))
  const taken = run.commit ? null : await takenNumbers(run.prisma, 'purchaseInvoice', companyId, [...numbers.values()])
  const seen = new Set()
  for (const invoice of invoices) {
    const number = numbers.get(invoice.id)
    const supplierId = supplierIds.get(model.supplierIdOf(invoice)) ?? null
    const files = invoiceFiles(invoice)
    try {
      if (!run.commit) {
        if (refs.has(invoice.id)) { ids.set(invoice.id, refs.get(invoice.id)); run.report.count('invoices', 'matched') } else {
          const key = `${supplierId ?? ''}|${number}`
          if ((taken.get(number) ?? []).some((row) => (row.supplierId ?? '') === (supplierId ?? '')) || seen.has(key)) { run.report.conflict('invoices', 'INVOICE_NUMBER_TAKEN', invoice.id); continue }
          seen.add(key); ids.set(invoice.id, `dry:invoice:${invoice.id}`); run.report.count('invoices', 'created')
        }
        for (const file of files) {
          if (fileRefs.has(file.legacyId)) { run.report.count('invoiceFiles', 'matched'); run.report.file('alreadyStored'); continue }
          if (await dryFile(run, file.key, 'invoiceFiles', invoice.id)) run.report.count('invoiceFiles', 'created')
          else run.report.count('invoiceFiles', 'skipped')
        }
        continue
      }
      let invoiceId = refs.get(invoice.id) ?? null
      const pending = files.filter((f) => !fileRefs.has(f.legacyId))
      const buffers = new Map()
      for (const file of pending) {
        const fetched = await fetchFile(run, file.key, 'invoiceFiles', invoice.id)
        if (fetched) buffers.set(file.label, fetched.buffer)
      }
      if (!invoiceId) {
        const orderId = invoice.purchaseOrderId ? orderIds.get(invoice.purchaseOrderId) ?? null : null
        if (invoice.purchaseOrderId && !orderId) run.report.warn('INVOICE_ORDER_NOT_MIGRATED')
        const result = await run.toolkit.importPurchaseInvoice({
          companyId, actorId: run.actorId, source: run.sourceName, legacyId: invoice.id, number, status: 'PAID',
          issueDate: dayOf(invoice.createdAt ?? new Date(), run.model.timeZone), createdAt: invoice.createdAt,
          supplierId: isReal(supplierId) ? supplierId : null, purchaseOrderId: orderId, xmlBuffer: buffers.get('xml') ?? null, notes: noteFor(invoice.concept, number),
        })
        if (result.conflict) { run.report.conflict('invoices', 'INVOICE_NUMBER_TAKEN', invoice.id); continue }
        invoiceId = result.id
        if (buffers.has('xml') && !result.fiscalUuid) run.report.warn('INVOICE_XML_WITHOUT_UUID')
        run.report.count('invoices', result.created ? 'created' : 'matched')
      } else run.report.count('invoices', 'matched')
      ids.set(invoice.id, invoiceId)
      for (const file of files) {
        if (fileRefs.has(file.legacyId)) { run.report.count('invoiceFiles', 'matched'); run.report.file('alreadyStored'); continue }
        const buffer = buffers.get(file.label)
        if (!buffer) { run.report.count('invoiceFiles', 'skipped'); continue }
        try {
          const attached = await run.toolkit.attachPurchaseFile({
            companyId, actorId: run.actorId, source: run.sourceName, legacyId: file.legacyId, ownerType: 'purchase_invoice', ownerId: invoiceId,
            buffer, fileName: file.fileName, mimeType: file.mimeType, label: file.label,
          })
          run.report.count('invoiceFiles', attached.created ? 'created' : 'matched')
        } catch (error) {
          run.report.error('invoiceFiles', errorCode('INVOICE_FILE', error), invoice.id)
        }
      }
    } catch (error) {
      run.report.error('invoices', errorCode('INVOICE', error), invoice.id)
    }
  }
  return ids
}
