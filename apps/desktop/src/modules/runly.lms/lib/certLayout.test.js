import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampField, defaultField, layoutPayload, moveField, nudge, resizeField, sameLayout, upsertField } from './certLayout.js'

const page = { width: 792, height: 612 }

test('fields stay inside the page when moved or resized', () => {
  const f = { key: 'curso', x: 700, y: 10, w: 80, h: 20, fontSize: 12 }
  assert.deepEqual(moveField(f, 50, -30, page), { ...f, x: 712, y: 0 })
  assert.equal(resizeField(f, 'e', 100, 0, page).w, 92)
  const nw = resizeField({ key: 'qr', x: 100, y: 100, w: 50, h: 50 }, 'nw', -20, 200, page)
  assert.deepEqual([nw.x, nw.y, nw.w, nw.h], [80, 142, 70, 8])
  assert.deepEqual(clampField({ key: 'logo', x: -5, y: 900, w: 2, h: 40 }, page), { key: 'logo', x: 0, y: 572, w: 8, h: 40 })
})

test('defaults, nudges, ordering and payload', () => {
  const alumno = defaultField('alumno', page)
  assert.equal(alumno.align, 'center')
  assert.ok(alumno.bold)
  assert.ok(defaultField('qr', page).x + defaultField('qr', page).w <= page.width)
  assert.deepEqual(nudge('ArrowUp'), [0, -1])
  assert.deepEqual(nudge('ArrowRight', true), [10, 0])
  assert.equal(nudge('a'), null)
  const fields = upsertField([defaultField('qr', page)], alumno)
  assert.deepEqual(fields.map((f) => f.key), ['alumno', 'qr'])
  assert.deepEqual(Object.keys(layoutPayload(fields).fields[1]), ['key', 'x', 'y', 'w', 'h'])
  assert.ok(sameLayout(fields, [...fields]))
  assert.ok(!sameLayout(fields, [alumno]))
})
