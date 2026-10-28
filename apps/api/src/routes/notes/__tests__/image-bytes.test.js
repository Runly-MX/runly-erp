import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { noteImageBytes } from '../image-bytes.js'
test('Historical self-contained SVG and AVIF render as PNG without changing originals',async()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>')
  const original=Buffer.from(svg),rendered=await noteImageBytes(svg)
  assert.equal(rendered.mime,'image/png');assert.deepEqual(svg,original)
  assert.equal((await sharp(rendered.bytes).metadata()).width,2)
  const avif=await sharp(rendered.bytes).avif().toBuffer()
  assert.equal((await noteImageBytes(avif)).mime,'image/png')
})
test('Image decoder rejects SVG external references, entities, active markup and garbage',async()=>{
  for(const markup of ['<image href="file:///example"/>','<image href="https://example.test/x"/>','<!ENTITY image "x">','<script>alert(1)</script>','<foreignObject/>'])
    await assert.rejects(noteImageBytes(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)),error=>error.status===415)
  await assert.rejects(noteImageBytes(Buffer.from('<html>not an image</html>')),error=>error.status===415)
})
