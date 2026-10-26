import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { buildPrintPdf } from './studio-print.js'

const png = () => sharp({ create: { width: 300, height: 200, channels: 4, background: '#d946ef' } }).png().toBuffer()

test('print PDF: CMYK image, page = trim + bleed + marks, trim and bleed boxes', async () => {
  const bytes = await buildPrintPdf({ image: await png(), widthMm: 100, heightMm: 70, bleedMm: 3, cropMarks: true, profile: 'cmyk', title: 'Flyer' })
  assert.ok(bytes.includes('DeviceCMYK'))
  const page = (await PDFDocument.load(bytes)).getPage(0), mm = 72 / 25.4
  assert.ok(Math.abs(page.getWidth() - (100 + 2 * (3 + 2 + 5)) * mm) < 0.01)
  const trim = page.getTrimBox(); assert.ok(Math.abs(trim.width - 100 * mm) < 0.01 && Math.abs(trim.x - 10 * mm) < 0.01)
  assert.ok(Math.abs(page.getBleedBox().width - 106 * mm) < 0.01)
})

test('print PDF: RGB without marks keeps the trim size; bad input is rejected', async () => {
  const bytes = await buildPrintPdf({ image: await png(), widthMm: 100, heightMm: 70, profile: 'rgb' })
  assert.equal(bytes.includes('DeviceCMYK'), false)
  assert.ok(Math.abs((await PDFDocument.load(bytes)).getPage(0).getWidth() - 100 * 72 / 25.4) < 0.01)
  await assert.rejects(buildPrintPdf({ image: Buffer.from('nope'), widthMm: 100, heightMm: 70 }), { status: 400 })
  await assert.rejects(buildPrintPdf({ image: await png(), widthMm: 5, heightMm: 70 }), { status: 400 })
  await assert.rejects(buildPrintPdf({ image: await png(), widthMm: 100, heightMm: 70, profile: 'hsl' }), { status: 400 })
})
