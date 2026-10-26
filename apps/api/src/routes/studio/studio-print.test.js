import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { buildPrintPdf } from './studio-print.js'

const png = (w=100,h=70,b=0) => sharp({ create: { width: Math.ceil((w+2*b)/25.4*300), height: Math.ceil((h+2*b)/25.4*300), channels: 4, background: '#d946ef' } }).png().toBuffer()

test('print PDF: CMYK image, page = trim + bleed + marks, trim and bleed boxes', async () => {
  const bytes = await buildPrintPdf({ image: await png(100,70,3), widthMm: 100, heightMm: 70, bleedMm: 3, cropMarks: true, profile: 'cmyk', title: 'Flyer' })
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
test('print rejects fake resolution, orientation, oversized physical requests and concurrent decoders',async()=>{
  const image=await png()
  await assert.rejects(buildPrintPdf({image:await sharp(image).resize(300,200).png().toBuffer(),widthMm:100,heightMm:70}),/300 ppp/)
  await assert.rejects(buildPrintPdf({image:await sharp(image).withMetadata({orientation:6}).png().toBuffer(),widthMm:100,heightMm:70}),/orientación/)
  await assert.rejects(buildPrintPdf({image,widthMm:2000,heightMm:2000}),{status:413})
  const pending=buildPrintPdf({image,widthMm:100,heightMm:70})
  await assert.rejects(buildPrintPdf({image,widthMm:100,heightMm:70}),{status:429});await pending
})

test('print cancellation stops at native boundaries, releases its slot and leaves source bytes intact',async()=>{
  const image=await png(150,150),original=Buffer.from(image),controller=new AbortController()
  const job=buildPrintPdf({image,widthMm:150,heightMm:150,signal:controller.signal})
  controller.abort()
  await assert.rejects(job,{name:'AbortError'})
  assert.deepEqual(image,original)
  assert.ok((await buildPrintPdf({image,widthMm:150,heightMm:150})).subarray(0,5).equals(Buffer.from('%PDF-')))
  await assert.rejects(buildPrintPdf({image,widthMm:150,heightMm:150,signal:controller.signal}),{name:'AbortError'})
})
