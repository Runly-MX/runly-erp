import test from 'node:test'
import assert from 'node:assert/strict'
import { extractOutline, countPages, slugify } from '../outline.js'

const node = (name, text = '', attrs = {}) => ({ type: { name }, textContent: text, attrs })
const fakeDoc = (entries) => ({ descendants(cb) { entries.forEach(([n, pos]) => cb(n, pos)) } })

test('slugify strips accents and symbols', () => {
  assert.equal(slugify('Introducción: ¡Hola Mundo!'), 'introduccion-hola-mundo')
})

test('extracts headings with level, text, pos and unique ids', () => {
  const doc = fakeDoc([
    [node('paragraph', 'Titulo de la nota'), 0],
    [node('heading', 'Objetivo', { level: 1 }), 20],
    [node('heading', 'Objetivo', { level: 2 }), 60],
    [node('heading', '   ', { level: 2 }), 90],
  ])
  assert.deepEqual(extractOutline(doc), [
    { id: 'objetivo', level: 1, text: 'Objetivo', pos: 20 },
    { id: 'objetivo-1', level: 2, text: 'Objetivo', pos: 60 },
  ])
})

test('countPages is page breaks plus one', () => {
  assert.equal(countPages(fakeDoc([[node('paragraph'), 0]])), 1)
  assert.equal(countPages(fakeDoc([[node('pageBreak'), 0], [node('pageBreak'), 5]])), 3)
})
