import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sha256Hex, typeForName, verifyFileContent } from '../file-integrity.js'

const zip = (part) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`....[Content_Types].xml ${part}workbook.xml`)])
const xlsx = zip('xl/'), docx = zip('word/'), pdf = Buffer.from('%PDF-1.7\n...'), csv = Buffer.from('region,ventas\nnorte,10\n')
const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3])
const auth = (name, buf, extra = {}) => ({ fileName: name, sizeBytes: buf.length, ...extra })

test('real Excel, Word, PDF, CSV and legacy xls pass with their detected type and hash', () => {
  for (const [name, buf, type] of [['r.xlsx', xlsx, 'xlsx'], ['r.docx', docx, 'docx'], ['r.pdf', pdf, 'pdf'], ['r.csv', csv, 'csv'], ['r.xls', ole, 'xls']]) {
    const result = verifyFileContent(buf, auth(name, buf, { sha256: sha256Hex(buf) }))
    assert.equal(result.ok, true, name)
    assert.equal(result.type, type)
    assert.equal(result.sha256, sha256Hex(buf))
  }
})

test('forged extension or MIME: the bytes decide', () => {
  const exeAsXlsx = Buffer.from('MZ\x90\x00 this is a program')
  assert.equal(verifyFileContent(exeAsXlsx, auth('ventas.xlsx', exeAsXlsx)).code, 'CONTENT_MISMATCH')
  assert.equal(verifyFileContent(docx, auth('ventas.xlsx', docx)).code, 'CONTENT_MISMATCH', 'a Word file renamed .xlsx')
  assert.equal(verifyFileContent(pdf, auth('informe.csv', pdf)).code, 'CONTENT_MISMATCH', 'binary is not CSV')
  assert.equal(verifyFileContent(pdf, auth('informe.exe', pdf)).code, 'TYPE_NOT_ALLOWED')
  assert.equal(verifyFileContent(pdf, auth('informe.pdf', pdf), ['xlsx']).code, 'TYPE_NOT_ALLOWED', 'not accepted by the activity')
})

test('size and hash must match the authorization (incomplete or altered transfers)', () => {
  assert.equal(verifyFileContent(xlsx.subarray(0, 10), auth('r.xlsx', xlsx)).code, 'SIZE_MISMATCH')
  assert.equal(verifyFileContent(xlsx, auth('r.xlsx', xlsx, { sha256: 'a'.repeat(64) })).code, 'HASH_MISMATCH')
  assert.equal(verifyFileContent(xlsx, auth('r.xlsx', xlsx)).ok, true, 'hash optional: computed and stored anyway')
})

test('type by name', () => {
  assert.equal(typeForName('Datos.XLSX'), 'xlsx')
  assert.equal(typeForName('foto.jpeg'), 'jpg')
  assert.equal(typeForName('sin-extension'), null)
})
