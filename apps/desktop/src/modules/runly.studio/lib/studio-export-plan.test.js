import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planExport, planPrintExport } from './studio-export-plan.js'

test('screen export reports the final pixel size', () => {
  const plan = planExport({ width: 1080, height: 1350 }, { type: 'png', scale: 2 })
  assert.deepEqual(plan.size, { width: 2160, height: 2700, scale: 2 })
  assert.equal(plan.error, undefined)
})

test('screen export over the limits is reported, not reduced', () => {
  const plan = planExport({ width: 6000, height: 6000 }, { type: 'jpg', scale: 3 })
  assert.equal(plan.size, undefined)
  assert.match(plan.error, /80 megapíxeles|16384/)
})

test('print export: trim, sheet with bleed and marks, and pixels at 300 ppp', () => {
  const plan = planPrintExport({ width: 1050, height: 1500 }, { ppi: 150, bleed: true, cropMarks: true })
  assert.deepEqual(plan.trim, { width: 177.8, height: 254 })
  assert.deepEqual(plan.sheet, { width: 177.8 + 20, height: 254 + 20 })
  assert.equal(plan.size.scale, 2)
  assert.equal(plan.size.width, Math.ceil((1050 + 2 * (3 / 25.4 * 150)) * 2))
})

test('print export without bleed or marks is the trim size', () => {
  const plan = planPrintExport({ width: 960, height: 960 }, { ppi: 96, bleed: false, cropMarks: false })
  assert.deepEqual(plan.sheet, plan.trim)
  assert.deepEqual(plan.size, { width: 3000, height: 3000, scale: 3.125 })
})

test('print export outside the accepted physical range is blocked', () => {
  assert.match(planPrintExport({ width: 100, height: 100 }, { ppi: 300, bleed: false, cropMarks: false }).error, /entre 10 y 2000 mm/)
  assert.match(planPrintExport({ width: 9000, height: 9000 }, { ppi: 72, bleed: false, cropMarks: false }).error, /2000 mm|más píxeles/)
})

test('print export is limited to 32 MP at 300 ppp, below the 80 MP of screen formats', () => {
  const plan = planPrintExport({ width: 4096, height: 4096 }, { ppi: 96, bleed: false, cropMarks: false })
  assert.equal(plan.size, undefined)
  assert.match(plan.error, /32 MP/)
  assert.equal(planPrintExport({ width: 2480, height: 3508 }, { ppi: 300, bleed: false, cropMarks: false }).error, null)
})

test('multipage PDF plans every page with its own size and blocks an oversized set', async () => {
  const { planPdfPages } = await import('./studio-export-plan.js')
  const page = (label, width, height) => ({ label, width, height, ppiDefault: 96 })
  const ok = planPdfPages([page('Página 1', 800, 600), page('Página 2', 600, 800)], { bleed: true, cropMarks: false })
  assert.equal(ok.error, null)
  assert.equal(ok.items.length, 2)
  assert.notDeepEqual(ok.items[0].plan.trim, ok.items[1].plan.trim)
  const bad = planPdfPages([page('Página 1', 800, 600), page('Portada', 4096, 4096)], { bleed: true, cropMarks: true, ppi: 96 })
  assert.match(bad.error, /^Portada:/)
  const many = planPdfPages(Array.from({ length: 16 }, (_, index) => page(`Página ${index + 1}`, 4096, 4096)), { bleed: false, cropMarks: false, ppi: 300 })
  assert.match(many.error ?? '', /suman .* MP/)
  assert.match(planPdfPages([], { bleed: false, cropMarks: false }).error, /al menos una página/)
})
