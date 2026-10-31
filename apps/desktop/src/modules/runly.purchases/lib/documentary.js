// Control documental (purchase-economic-mode.js in the API): orders and
// invoices registered as references, without amounts, taxes or payments.
// The mode of a DOCUMENT comes from the document itself (economicMode), never
// from the company's current setting: history keeps its own treatment.

export const isDocumentaryDoc = (doc) => doc?.economicMode === 'DOCUMENTARY'

// Labels and inputs for the documentary fields the API allows to correct
// (doc.correction.fields only carries { field, value }).
export const DOCUMENTARY_FIELD_META = {
  reference: { label: 'Nombre o referencia', type: 'text', max: 255 },
  description: { label: 'Descripción', type: 'textarea', max: 2000 },
  supplierId: { label: 'Proveedor', type: 'supplier' },
  issueDate: { label: 'Fecha del documento', type: 'date' },
  expectedDate: { label: 'Entrega esperada', type: 'date' },
  notes: { label: 'Observaciones', type: 'textarea', max: 2000 },
  fiscalUuid: { label: 'UUID fiscal (CFDI)', type: 'text', max: 36, note: 'Se guarda como dato; no se valida ante el SAT.' },
}

const MISSING = { supplierId: 'proveedor', issueDate: 'fecha del documento' }

// Unknown (never captured) data worth completing, from the API's unknownFields.
export function missingDocumentaryData(doc) {
  return (doc?.unknownFields ?? []).filter((field) => MISSING[field]).map((field) => ({ field, label: MISSING[field] }))
}

// The name people use for the document: its reference; the internal folio otherwise.
export const documentLabel = (doc) => (isDocumentaryDoc(doc) ? doc.reference ?? doc.number : doc?.number) ?? 'Sin folio'
