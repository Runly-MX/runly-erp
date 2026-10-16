import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLabelPreview } from '../label-preview.js'
import { templateToDraft } from '../label-layout.js'

const item = { id: '1', folio: 'INV-000123', serialNumber: 'NC312399U23-XK44-2209', assetTag: '4501' }
const draft = (patch = {}) => ({ ...templateToDraft({ widthMm: 60, heightMm: 40, layout: 'qr-left', fields: ['folio', 'serial', 'assetTag'] }), ...patch })

test('builds an SVG with every selected field and a QR, without network', () => {
  const p = buildLabelPreview({ draft: draft(), item, origin: 'https://erp.example.com' })
  assert.equal(p.error, null)
  assert.equal(p.overflow, 0)
  assert.match(p.svg, /^<svg [^>]*width="100%"/)
  assert.match(p.svg, />INV-000123</)
  assert.match(p.svg, /NC312399U23/)
  assert.match(p.svg, />Act\. 4501</)
  assert.match(p.svg, /<path d="M/)
})

test('fixed text size changes the rendered size; bad drafts report an error', () => {
  const size = (fontMm) => Number(buildLabelPreview({ draft: draft({ textOptions: { ...draft().textOptions, fontMm } }), item }).svg.match(/font-size="([\d.]+)"/)[1])
  assert.ok(size(4) > size(2))
  assert.equal(buildLabelPreview({ draft: draft({ widthMm: 5 }), item }).svg, null)
  assert.match(buildLabelPreview({ draft: draft({ widthMm: 5 }), item }).error, /ancho/)
  assert.equal(buildLabelPreview({ draft: draft(), item: null }).svg, null)
})
