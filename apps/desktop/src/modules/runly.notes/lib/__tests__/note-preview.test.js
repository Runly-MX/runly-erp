import test from 'node:test'
import assert from 'node:assert/strict'
import { extractPreview } from '../notePreview.js'

const checklistHtml =
  '<p>Compras</p><ul data-type="taskList">' +
  '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label><div><p>Leche</p></div></li>' +
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Pan</p></div></li>' +
  '</ul>'

test('extracts checklist items with checked state and counts', () => {
  const p = extractPreview(checklistHtml, 'Compras')
  assert.deepEqual(p.checklist.items, [{ checked: true, text: 'Leche' }, { checked: false, text: 'Pan' }])
  assert.equal(p.checklist.total, 2)
  assert.equal(p.checklist.done, 1)
})

test('limits visible checklist items to 5 but counts all', () => {
  const li = (i) => `<li data-checked="false" data-type="taskItem"><div><p>t${i}</p></div></li>`
  const html = `<ul data-type="taskList">${[1, 2, 3, 4, 5, 6, 7].map(li).join('')}</ul>`
  const p = extractPreview(html, '')
  assert.equal(p.checklist.items.length, 5)
  assert.equal(p.checklist.total, 7)
})

test('excerpt drops the title line and checklist text, trims to 240 chars', () => {
  const p = extractPreview('<p>Titulo</p><p>' + 'a'.repeat(400) + '</p>', 'Titulo')
  assert.equal(p.excerpt.startsWith('Titulo'), false)
  assert.equal(p.excerpt.length <= 240, true)
})

test('finds the first image src', () => {
  const p = extractPreview('<p>x</p><img src="https://a/b.png" alt=""><img src="https://a/c.png">', '')
  assert.equal(p.firstImage, 'https://a/b.png')
})

test('non-string content yields an empty preview', () => {
  const p = extractPreview(null, '')
  assert.deepEqual(p, { excerpt: '', checklist: null, firstImage: null })
})
