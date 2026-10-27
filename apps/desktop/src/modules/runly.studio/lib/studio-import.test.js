import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyImport, importErrorMessage, importTargets, validateImportFile } from './studio-import.js'

const file = (name, size) => ({ name, size })

test('only .runlystudio and small .svg files are accepted', () => {
  assert.equal(validateImportFile(file('a.runlystudio', 10)).kind, 'package')
  assert.equal(validateImportFile(file('A.SVG', 10)).kind, 'svg')
  assert.match(validateImportFile(file('a.png', 10)).error, /Formato no admitido/)
  assert.match(validateImportFile(file('a.svg', 40000)).error, /32 KB/)
  assert.match(validateImportFile(file('a.runlystudio', 65 * 1024 * 1024)).error, /64 MB/)
  assert.equal(validateImportFile(file('a.runlystudio', 0)).ok, false)
})

test('fidelity level never reads as editable when something is lost or converted', () => {
  assert.equal(classifyImport({ warnings: [], blockingErrors: [] }).level, 'editable')
  const licence = classifyImport({ warnings: ['Las licencias son declaraciones no verificadas. Comprueba los derechos antes de compartir.'] })
  assert.equal(licence.level, 'editable'); assert.equal(licence.licenseNotice, true); assert.equal(licence.needsAcceptance, true)
  const adjusted = classifyImport({ warnings: ['Los grupos anidados se aplanan al grupo exterior.'] })
  assert.equal(adjusted.level, 'adjusted'); assert.equal(adjusted.losses.length, 1)
  const raster = classifyImport({ warnings: ['Los grupos anidados se aplanan.', 'La página 2 se convierte en imagen.'] })
  assert.equal(raster.level, 'raster'); assert.equal(raster.losses[1].page, 2)
  const blocked = classifyImport({ warnings: ['x'], blockingErrors: ['Falta una fuente'] })
  assert.equal(blocked.level, 'incompatible'); assert.equal(blocked.cannotImport, true); assert.equal(blocked.blockers[0].text, 'Falta una fuente')
})

test('destinations follow permissions and company publishing is never offered without it', () => {
  assert.deepEqual(importTargets({ canUse: true }).map(row => row.value), ['design'])
  assert.deepEqual(importTargets({ canUse: true, canSavePersonal: true }).map(row => row.value), ['design', 'personal'])
  assert.deepEqual(importTargets({ canSavePersonal: true, canSaveCompany: true }).map(row => row.value), ['personal', 'company'])
  assert.deepEqual(importTargets({}), [])
})

test('errors become readable Spanish without internals', () => {
  assert.match(importErrorMessage({ status: 403 }), /permiso/)
  assert.match(importErrorMessage({ status: 429 }), /pendientes/)
  assert.match(importErrorMessage({ status: 500, message: 'ECONNRESET at x.js:1' }), /servidor/)
  assert.match(importErrorMessage({ name: 'TypeError', message: 'Failed to fetch' }), /conectar/)
})
