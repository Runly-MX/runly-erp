import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptAttr, precheckFile, sha256Hex } from './lmsSessionFiles.js'

const types = [{ key: 'xlsx', label: 'Excel', ext: 'xlsx' }, { key: 'pptx', label: 'PowerPoint', ext: 'pptx' }]

test('precheck: format, empty and size before uploading', () => {
  assert.equal(precheckFile({ name: 'Resuelto.XLSX', size: 10 }, { acceptedTypes: types, maxFileMb: 1 }), null)
  assert.match(precheckFile({ name: 'resuelto.pdf', size: 10 }, { acceptedTypes: types }), /XLSX, PPTX/)
  assert.match(precheckFile({ name: 'a.xlsx', size: 0 }, { acceptedTypes: types }), /vacío/)
  assert.match(precheckFile({ name: 'a.xlsx', size: 2 * 1024 * 1024 }, { acceptedTypes: types, maxFileMb: 1 }), /1 MB/)
  assert.equal(precheckFile({ name: 'foto.jpeg', size: 5 }, { acceptedTypes: [{ ext: 'jpg' }] }), null)
  assert.equal(acceptAttr(types), '.xlsx,.pptx')
})

test('sha256 matches the server format', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
