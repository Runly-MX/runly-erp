// apps/api/src/routes/notes/append-blocks.js
//
// Pure helpers behind "append text to an existing note" (MCP / MirAI). The
// text is lightweight markdown (headings, bullets, tasks, paragraphs) turned
// into blocks that are then rendered three ways: the HTML mirror stored in
// notes.content, the plain-text mirror in notes.content_text, and Y.js nodes
// appended to the collaborative document the editor prefers.
//
// Node and attribute names match the editor schema (TipTap StarterKit +
// TaskList/TaskItem, serialized by y-prosemirror): paragraph, heading{level},
// bulletList > listItem > paragraph, taskList > taskItem{checked} > paragraph.
import * as Y from 'yjs'

const HEADING = /^(#{1,3})\s+(.*)$/
const TASK = /^[-*]\s+\[([ xX])\]\s+(.*)$/
const BULLET = /^[-*]\s+(.*)$/
const IMAGE = /^!\[([^\]]*)\]\(\s*(\S+?)\s*\)$/

export function parseAppendText(text) {
  const blocks = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    let m = line.match(IMAGE)
    if (m) {
      blocks.push({ type: 'image', url: m[2], alt: m[1].trim().slice(0, 200) })
      continue
    }
    m = line.match(HEADING)
    if (m && m[2].trim()) {
      blocks.push({ type: 'heading', level: m[1].length, text: m[2].trim() })
      continue
    }
    m = line.match(TASK)
    if (m && m[2].trim()) {
      const item = { text: m[2].trim(), checked: m[1].toLowerCase() === 'x' }
      const last = blocks[blocks.length - 1]
      if (last?.type === 'taskList') last.items.push(item)
      else blocks.push({ type: 'taskList', items: [item] })
      continue
    }
    m = line.match(BULLET)
    if (m && m[1].trim()) {
      const item = { text: m[1].trim() }
      const last = blocks[blocks.length - 1]
      if (last?.type === 'bulletList') last.items.push(item)
      else blocks.push({ type: 'bulletList', items: [item] })
      continue
    }
    blocks.push({ type: 'paragraph', text: line })
  }
  return blocks
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Same attributes the editor's image node serializes (AnnotatableImage.jsx).
function imageHtml(b) {
  const alt = b.alt ? ` alt="${escapeHtml(b.alt)}"` : ''
  const width = b.width != null ? ` data-width="${escapeHtml(b.width)}"` : ''
  const ratio = b.aspectRatio ? ` data-aspect-ratio="${escapeHtml(b.aspectRatio)}"` : ''
  return `<img src="${escapeHtml(b.src)}"${alt}${width}${ratio}>`
}

export function blocksToHtml(blocks) {
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading': return `<h${b.level}>${escapeHtml(b.text)}</h${b.level}>`
      case 'bulletList': return `<ul>${b.items.map((i) => `<li><p>${escapeHtml(i.text)}</p></li>`).join('')}</ul>`
      case 'taskList':
        return `<ul data-type="taskList">${b.items.map((i) => `<li data-checked="${i.checked ? 'true' : 'false'}" data-type="taskItem"><label><input type="checkbox"${i.checked ? ' checked="checked"' : ''}><span></span></label><div><p>${escapeHtml(i.text)}</p></div></li>`).join('')}</ul>`
      case 'image': return b.src ? imageHtml(b) : ''
      default: return `<p>${escapeHtml(b.text)}</p>`
    }
  }).join('')
}

export function blocksToPlainText(blocks) {
  const lines = []
  for (const b of blocks) {
    if (b.type === 'image') {
      if (b.alt) lines.push(b.alt)
      continue
    }
    if (b.items) for (const i of b.items) lines.push(i.text)
    else lines.push(b.text)
  }
  return lines.join('\n')
}

function paragraphNode(text) {
  const p = new Y.XmlElement('paragraph')
  const t = new Y.XmlText()
  t.insert(0, text)
  p.insert(0, [t])
  return p
}

function blockToNode(b) {
  if (b.type === 'image') {
    // Attribute names/defaults follow the editor node; y-prosemirror skips null attrs.
    const img = new Y.XmlElement('image')
    img.setAttribute('src', b.src)
    if (b.alt) img.setAttribute('alt', b.alt)
    img.setAttribute('annotations', '[]')
    img.setAttribute('erasedAnnotations', '[]')
    if (b.width != null) img.setAttribute('width', b.width)
    if (b.aspectRatio) img.setAttribute('aspectRatio', b.aspectRatio)
    return img
  }
  if (b.type === 'heading') {
    const h = new Y.XmlElement('heading')
    h.setAttribute('level', b.level)
    const t = new Y.XmlText()
    t.insert(0, b.text)
    h.insert(0, [t])
    return h
  }
  if (b.type === 'bulletList') {
    const list = new Y.XmlElement('bulletList')
    list.insert(0, b.items.map((i) => {
      const li = new Y.XmlElement('listItem')
      li.insert(0, [paragraphNode(i.text)])
      return li
    }))
    return list
  }
  if (b.type === 'taskList') {
    const list = new Y.XmlElement('taskList')
    list.insert(0, b.items.map((i) => {
      const item = new Y.XmlElement('taskItem')
      item.setAttribute('checked', Boolean(i.checked))
      item.insert(0, [paragraphNode(i.text)])
      return item
    }))
    return list
  }
  return paragraphNode(b.text)
}

// Appends the blocks at the end of the document's ProseMirror fragment.
export function appendBlocksToYDoc(ydoc, blocks) {
  const fragment = ydoc.getXmlFragment('default')
  ydoc.transact(() => {
    fragment.insert(fragment.length, blocks.filter((b) => b.type !== 'image' || b.src).map(blockToNode))
  })
}
