// Card preview derived from the list row's HTML snapshot (notes.content). The
// editor's Y.js document is the live source of truth; this is display only.
const MAX_ITEMS = 5
const EXCERPT_MAX = 240

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const strip = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

export function extractPreview(html, title = '') {
  if (!html || typeof html !== 'string') return { excerpt: '', checklist: null, firstImage: null }

  const items = []
  const itemRe = /<li[^>]*data-type="taskItem"[^>]*>([\s\S]*?)<\/li>/gi
  let m
  while ((m = itemRe.exec(html)) !== null) {
    const tag = m[0].slice(0, m[0].indexOf('>') + 1)
    items.push({ checked: /data-checked="true"/.test(tag), text: strip(m[1]) })
  }
  const checklist = items.length
    ? { items: items.slice(0, MAX_ITEMS), total: items.length, done: items.filter(i => i.checked).length }
    : null

  const img = /<img[^>]*\ssrc="([^"]+)"/i.exec(html)

  const withoutLists = html.replace(/<ul[^>]*data-type="taskList"[\s\S]*?<\/ul>/gi, ' ')
  const spaced = withoutLists.replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, ' ')
  let text = strip(spaced)
  const t = (title || '').trim()
  if (t && text.startsWith(t)) text = text.slice(t.length).trim()

  return { excerpt: text.slice(0, EXCERPT_MAX), checklist, firstImage: img ? img[1] : null }
}
