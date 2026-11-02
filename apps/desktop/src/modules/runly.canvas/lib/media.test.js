import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FILE_STORE_LIMIT_BYTES, MAX_RASTER_SIDE, PDF_DPI, isDwg, isDxf, pdfRenderScale } from './media.js'

describe('PDF import resolution', () => {
  it('renders ordinary pages at print-quality 300 DPI', () => {
    assert.equal(PDF_DPI, 300)
    assert.equal(pdfRenderScale(612, 792), 300 / 72)
  })

  it('caps oversized plans at a 7200 px longest side', () => {
    const width = 2384, height = 3370
    const scale = pdfRenderScale(width, height)
    assert.equal(MAX_RASTER_SIDE, 7200)
    assert.ok(Math.abs(height * scale - MAX_RASTER_SIDE) < 0.001)
  })
})

describe('CAD file detection', () => {
  it('recognizes DWG and DXF by extension, case-insensitively', () => {
    assert.equal(isDwg({ name: 'Planta Baja.DWG' }), true)
    assert.equal(isDwg({ name: 'planta.dxf' }), false)
    assert.equal(isDxf({ name: 'planta.dwg' }), false)
    assert.equal(FILE_STORE_LIMIT_BYTES, 10 * 1024 * 1024)
  })
})
