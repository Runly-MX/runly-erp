import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SELECTION, labeledRows, queueReducer, statsAfterPrint, totalLabels } from '../label-queue.js'
import { autoSheet, clampSheet, maxGrid, sheetCells, sheetFit, sheetPages } from '../label-sheet.js'
import { loadDesign, saveDesign } from '../label-design-store.js'
import { matchContext } from '../label-search.js'
import { groupPrintBatches, reprintItems } from '../label-history.js'
import { draftToLayout, templateToDraft } from '../label-layout.js'

function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map }
}

describe('studio selection', () => {
  it('toggles rows, keeps copies per row and removes many at once', () => {
    let s = queueReducer([], { type: 'toggle', item: { id: 'a', coverImageFileId: 'f1' } })
    s = queueReducer(s, { type: 'toggle', item: { id: 'b' }, quantity: 3 })
    assert.equal(s[0].coverImageFileId, 'f1')
    assert.equal(totalLabels(s), 4)
    s = queueReducer(s, { type: 'toggle', item: { id: 'a' } })
    assert.deepEqual(s.map((r) => r.id), ['b'])
    s = queueReducer(s, { type: 'add', items: [{ id: 'c' }, { id: 'd' }] })
    assert.deepEqual(queueReducer(s, { type: 'removeMany', ids: ['b', 'd'] }).map((r) => r.id), ['c'])
  })
  it('replaces the selection for a reprint and caps it', () => {
    const s = queueReducer([{ id: 'x', quantity: 1 }], { type: 'replace', items: [{ id: 'a', quantity: 2 }, { id: 'a' }, { id: 'b', quantity: 9999 }] })
    assert.deepEqual(s.map((r) => [r.id, r.quantity]), [['a', 2], ['b', 500]])
    const fromLog = queueReducer([], { type: 'replace', items: [{ id: 'a', knownLabeled: true }] })
    assert.equal(labeledRows(fromLog).length, 1)
    const printed = queueReducer(fromLog, { type: 'stats', stats: statsAfterPrint([{ id: 'a', labelPrintCount: 2 }], new Date('2026-10-15T00:00:00Z')) })
    assert.equal(printed[0].labelPrintCount, 3)
    const many = Array.from({ length: MAX_SELECTION + 5 }, (_, i) => ({ id: `i${i}` }))
    assert.equal(queueReducer([], { type: 'add', items: many }).length, MAX_SELECTION)
  })
})

describe('letter sheet math', () => {
  it('computes the largest grid and flags grids that do not fit', () => {
    assert.deepEqual(maxGrid(60, 40, 3, 8), { columns: 3, rows: 6 })
    const fit = sheetFit({ columns: 4, rows: 6, gapMm: 3, marginMm: 8 }, 60, 40)
    assert.equal(fit.fits, false)
    assert.match(fit.reason, /3 columnas/)
    assert.deepEqual(autoSheet({ gapMm: 3, marginMm: 8 }, 60, 40).columns, 3)
    assert.equal(sheetFit({ columns: 3, rows: 6, gapMm: 3, marginMm: 8 }, 60, 40).perPage, 18)
    assert.equal(sheetPages(19, 18), 2)
    assert.equal(clampSheet({ columns: 'x', rows: 99 }).rows, 40)
  })
  it('centres the grid horizontally like the API', () => {
    const cells = sheetCells({ columns: 3, rows: 2, gapMm: 3, marginMm: 8 }, 60, 40)
    assert.equal(cells.length, 6)
    assert.ok(Math.abs(cells[0].x - (215.9 - 186) / 2) < 0.001)
    assert.equal(cells[4].y, 51)
  })
})

describe('saved design per company', () => {
  it('round-trips and isolates companies', () => {
    const storage = memoryStorage()
    const draft = templateToDraft({ widthMm: 50, heightMm: 30, fields: ['folio'], textOptions: { showFieldNames: true, fontMm: 3 } })
    assert.ok(saveDesign('c1', { templateId: 't1', printerId: null, draft, output: { mode: 'sheet', sheet: { columns: 2 } } }, storage))
    const back = loadDesign('c1', storage)
    assert.equal(back.output.mode, 'sheet')
    assert.equal(back.output.sheet.columns, 2)
    assert.equal(back.printerId, null)
    assert.deepEqual(draftToLayout(back.draft).textOptions, { showFieldNames: true, fontMm: 3 })
    assert.equal(loadDesign('c2', storage), null)
  })
  it('survives broken storage and garbage', () => {
    const storage = memoryStorage()
    storage.setItem('runly.inventory.labels.design.c1', '{nope')
    assert.equal(loadDesign('c1', storage), null)
    const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
    assert.equal(loadDesign('c1', throwing), null)
    assert.equal(saveDesign('c1', { draft: templateToDraft(null) }, throwing), false)
  })
})

describe('search match context and history runs', () => {
  it('names the field that matched when it is not the name or folio', () => {
    const item = { name: 'Laptop Dell', folio: 'LT-1', serialNumber: 'ABC123', assignedTo: { firstName: 'Ana', lastName: 'López' } }
    assert.equal(matchContext(item, 'dell'), null)
    assert.deepEqual(matchContext(item, 'abc'), { label: 'Serie', value: 'ABC123' })
    assert.deepEqual(matchContext(item, 'lopez'), { label: 'Asignado a', value: 'Ana López' })
    assert.equal(matchContext(item, 'zzz'), null)
  })
  it('groups rows registered together into runs', () => {
    const at = '2026-10-15T10:00:00.000Z'
    const rows = [
      { itemId: 'a', itemName: 'A', quantity: 2, printedAt: at, userId: 'u', templateId: 't' },
      { itemId: 'b', itemName: 'B', quantity: 1, printedAt: at, userId: 'u', templateId: 't', itemEnabled: false },
      { itemId: 'a', itemName: 'A', quantity: 1, printedAt: '2026-10-14T10:00:00.000Z', userId: 'u', templateId: 't' },
    ]
    const runs = groupPrintBatches(rows)
    assert.equal(runs.length, 2)
    assert.equal(runs[0].labels, 3)
    assert.deepEqual(reprintItems(runs[0]).map((i) => i.id), ['a'])
  })
})
