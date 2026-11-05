import test from 'node:test'
import assert from 'node:assert/strict'
import { toState, toView } from '../detail-view-designer-state.js'
import { applyDetailView } from '../detail-view-layout.js'

const BLUEPRINT = {
  schema: {
    sections: [
      { id: 'identification', label: 'Identificación', column: 'main', columns: 2, fields: [{ field: 'folio', label: 'Folio' }, { field: 'serialNumber', label: 'Serie' }] },
      { id: 'attachments', type: 'attachments', label: 'Archivos', column: 'aside' },
      { id: 'history', type: 'component', label: 'Actividad', column: 'aside' },
    ],
  },
}
const EXTRA = [{ field: 'custom:cf1', label: 'Color' }]

test('without a view every base field is in a card and custom fields wait in the tray', () => {
  const state = toState(BLUEPRINT, null, EXTRA)
  assert.deepEqual(state.columns, { main: ['identification'], aside: ['attachments', 'history'] })
  assert.deepEqual(state.tray, ['custom:cf1'])
})

test('a saved view survives the designer round trip, hidden blocks included', () => {
  const view = {
    version: 1,
    sections: [
      { id: 'card_1', label: 'Datos', column: 'main', columns: 2, fields: ['custom:cf1', 'folio'] },
      { id: 'attachments', block: true, column: 'main' },
      { id: 'history', block: true, column: 'aside' },
    ],
    hidden: ['serialNumber', 'history'],
  }
  const back = toView(toState(BLUEPRINT, view, EXTRA))
  assert.deepEqual(back, view)
  assert.deepEqual(applyDetailView(BLUEPRINT, back, EXTRA).schema.sections.map((s) => s.id), ['card_1', 'attachments'])
})
