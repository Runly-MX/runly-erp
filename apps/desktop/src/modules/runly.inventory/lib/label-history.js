// Print runs for Etiquetas > Historial. GET /inventory/label-prints returns one
// row per item; rows registered together share printedAt + userId (one
// createMany), so consecutive rows with the same key form one run.
export function batchKey(row) {
  return `${new Date(row.printedAt).toISOString()}|${row.userId ?? ''}|${row.templateId ?? ''}|${row.printerId ?? ''}`
}

export function groupPrintBatches(rows = []) {
  const batches = []
  let current = null
  for (const row of rows) {
    const key = batchKey(row)
    if (!current || current.key !== key) {
      current = {
        key,
        printedAt: row.printedAt,
        userName: row.userName ?? null,
        templateId: row.templateId ?? null,
        templateName: row.templateName ?? null,
        printerId: row.printerId ?? null,
        printerName: row.printerName ?? null,
        items: [],
        labels: 0,
      }
      batches.push(current)
    }
    current.items.push({ id: row.itemId, name: row.itemName, folio: row.itemFolio, quantity: row.quantity, enabled: row.itemEnabled !== false })
    current.labels += Number(row.quantity) || 0
  }
  return batches
}

// Items of a run that still exist -> [{ id, name, folio, quantity }] for the selection.
export const reprintItems = (batch) => batch.items.filter((item) => item.enabled && item.id).map((item) => ({ ...item, knownLabeled: true }))
