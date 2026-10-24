import { extractOutline } from './outline.js'

// Resolves the heading position fresh (the doc may have changed since the
// outline was rendered) and scrolls its DOM node into view.
export function scrollToHeading(editor, id) {
  if (!editor?.view) return
  const target = extractOutline(editor.state.doc).find((item) => item.id === id)
  if (!target) return
  const dom = editor.view.nodeDOM(target.pos)
  dom?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}
