import test from 'node:test'
import assert from 'node:assert/strict'
import { moveId, newContentId, pageLabel, pageSignature, parsePageRange } from './studio-pages.js'

const ids = ['a', 'b', 'c', 'd', 'e']

test('labels use the name or the position', () => {
  assert.equal(pageLabel({ name: ' Portada ' }, 0), 'Portada')
  assert.equal(pageLabel({}, 2), 'Página 3')
})

test('signature changes with content only', () => {
  const scene = { page: { id: 'a' }, objects: [{ id: 'x', x: 1 }] }
  assert.equal(pageSignature(scene), pageSignature(JSON.parse(JSON.stringify(scene))))
  assert.notEqual(pageSignature(scene), pageSignature({ ...scene, objects: [{ id: 'x', x: 2 }] }))
})

test('content ids satisfy the document id pattern', () => {
  assert.match(newContentId('c'), /^[a-zA-Z0-9_-]{1,64}$/)
  assert.notEqual(newContentId(), newContentId())
})

test('ranges resolve in document order without duplicates', () => {
  assert.deepEqual(parsePageRange('5, 1-2, 2', ids), { ids: ['a', 'b', 'e'] })
  assert.deepEqual(parsePageRange('3', ids), { ids: ['c'] })
})

test('invalid ranges explain the problem', () => {
  assert.match(parsePageRange('', ids).error, /Escribe/)
  assert.match(parsePageRange('2-x', ids).error, /no es un rango/)
  assert.match(parsePageRange('4-2', ids).error, /inicio/)
  assert.match(parsePageRange('1-9', ids).error, /no existe: el diseño tiene 5/)
  assert.match(parsePageRange('0', ids).error, /inicio|rango/)
})

test('moveId keeps every id once', () => {
  assert.deepEqual(moveId(ids, 'a', 2), ['b', 'c', 'a', 'd', 'e'])
  assert.deepEqual(moveId(ids, 'e', 0), ['e', 'a', 'b', 'c', 'd'])
  assert.deepEqual(moveId(ids, 'c', 99), ['a', 'b', 'd', 'e', 'c'])
  assert.deepEqual(moveId(ids, 'zz', 1), ids)
})
