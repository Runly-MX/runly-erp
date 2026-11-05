import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDetailView, defaultDetailView, placedFieldKeys } from '../detail-view-layout.js'

const BLUEPRINT = {
  schema: {
    sections: [
      { id: 'identification', label: 'Identificación', column: 'main', columns: 2, fields: [{ field: 'folio', label: 'Folio' }, { field: 'serialNumber', label: 'Serie' }] },
      { label: 'Adquisición y garantía', column: 'main', fields: [{ field: 'receivedAt', label: 'Recepción', type: 'date' }] },
      { id: 'attachments', type: 'attachments', label: 'Archivos', column: 'aside' },
    ],
  },
}
const ids = (bp) => bp.schema.sections.map((s) => `${s.id}:${s.column}:${(s.fields ?? []).map((f) => f.field).join(',')}`)

test('the default view reproduces the base blueprint', () => {
  const view = defaultDetailView(BLUEPRINT)
  assert.equal(view.sections[1].id, 'adquisicion_y_garantia')
  assert.deepEqual(ids(applyDetailView(BLUEPRINT, view)), ['identification:main:folio,serialNumber', 'adquisicion_y_garantia:main:receivedAt', 'attachments:aside:'])
  assert.equal(applyDetailView(BLUEPRINT, null), BLUEPRINT)
})

test('cards regroup fields, keep base metadata, hide and drop unknown keys', () => {
  const view = {
    version: 1,
    sections: [
      { id: 'attachments', block: true, column: 'main' },
      { id: 'card_1', label: 'Recepción', column: 'aside', columns: 1, fields: ['receivedAt', 'custom:cf1', 'ghost'] },
    ],
    hidden: ['serialNumber'],
  }
  const result = applyDetailView(BLUEPRINT, view, [{ field: 'custom:cf1', label: 'Color' }])
  assert.deepEqual(ids(result), ['attachments:main:', 'card_1:aside:receivedAt,custom:cf1', 'otros_datos:main:folio'])
  assert.equal(result.schema.sections[1].fields[0].type, 'date')
  assert.deepEqual([...placedFieldKeys(view)], ['receivedAt', 'custom:cf1', 'ghost'])
})

test('a base field missing from the view falls back to "Otros datos" when its card is gone', () => {
  const view = { version: 1, sections: [{ id: 'card_1', label: 'Todo', column: 'main', fields: ['folio'] }], hidden: ['attachments'] }
  assert.deepEqual(ids(applyDetailView(BLUEPRINT, view)), ['card_1:main:folio', 'otros_datos:main:serialNumber,receivedAt'])
})
