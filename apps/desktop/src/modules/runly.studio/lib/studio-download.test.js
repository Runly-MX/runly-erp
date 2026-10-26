import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadName, sanitizeExportError } from './studio-download.js'

test('file names keep letters and drop path or control characters', () => {
  assert.equal(downloadName('Cartel: verano/2026 ✿', 'pdf'), 'Cartel verano2026.pdf')
  assert.equal(downloadName('///', 'png'), 'diseño.png')
})

test('known HTTP statuses become plain messages', () => {
  assert.match(sanitizeExportError({ status: 403, message: 'forbidden https://x.example/secret' }), /permiso/)
  assert.match(sanitizeExportError({ status: 503, message: 'upstream http://10.0.0.5:4010' }), /servidor/)
})

test('engine messages in Spanish pass; urls, tokens, paths and stacks do not', () => {
  assert.equal(sanitizeExportError(new Error('La exportación supera 80 megapíxeles o 16384 px por lado.')), 'La exportación supera 80 megapíxeles o 16384 px por lado.')
  for (const message of ['fetch https://studio.example.com/api/x failed', 'Bearer abcdefghijklmnopqrstuvwxyz123456', String.raw`ENOENT C:\Users\a\file.png`, 'at render (/app/apps/api/src/x.js:10:2)', 'x'.repeat(400)])
    assert.equal(sanitizeExportError(new Error(message)), 'No se pudo generar el archivo. Vuelve a intentarlo.')
  assert.match(sanitizeExportError(new TypeError('Failed to fetch')), /conectar/)
})
