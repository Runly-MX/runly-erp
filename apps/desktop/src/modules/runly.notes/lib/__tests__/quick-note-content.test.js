import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuickNoteContent } from '../quickNoteContent.js'

test('text note: title paragraph then body paragraphs, html escaped', () => {
  const { title, content } = buildQuickNoteContent({ mode: 'text', title: 'A <b>', body: 'l1\nl2' })
  assert.equal(title, 'A <b>')
  assert.equal(content, '<p>A &lt;b&gt;</p><p>l1</p><p>l2</p>')
})

test('checklist note: task list items with checked state', () => {
  const { content } = buildQuickNoteContent({
    mode: 'checklist', title: 'Compras',
    items: [{ text: 'Leche', checked: false }, { text: 'Pan', checked: true }, { text: '  ', checked: false }],
  })
  assert.match(content, /^<p>Compras<\/p><ul data-type="taskList">/)
  assert.match(content, /data-checked="true"/)
  assert.equal((content.match(/data-type="taskItem"/g) ?? []).length, 2)
})

test('empty composer yields null so nothing is created', () => {
  assert.equal(buildQuickNoteContent({ mode: 'text', title: ' ', body: '' }), null)
  assert.equal(buildQuickNoteContent({ mode: 'checklist', title: '', items: [{ text: '', checked: false }] }), null)
})

test('body without title uses the first body line as the title', () => {
  const { title, content } = buildQuickNoteContent({ mode: 'text', title: '', body: 'Recordar\nllamar' })
  assert.equal(title, 'Recordar')
  assert.equal(content, '<p>Recordar</p><p>llamar</p>')
})
