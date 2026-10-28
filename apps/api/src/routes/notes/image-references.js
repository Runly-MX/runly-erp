import * as Y from 'yjs'

export const NOTE_IMAGE_BUCKETS = ['runly-notes', 'atlas-notes']

// Origins in historical references may have changed. Never fetch that origin:
// this parser returns a key for the configured Storage service only.
export function parseNoteImageReference(raw) {
  if (typeof raw !== 'string' || raw.length > 8192) return null
  try {
    const url = new URL(raw.replaceAll('&amp;', '&'), 'https://reference.invalid')
    const match = url.pathname.match(/^\/storage\/v1\/(?:object\/(?:public|sign|authenticated)|render\/image\/(?:public|sign|authenticated))\/(runly-notes|atlas-notes)\/(.+)$/)
    if (!match) return null
    const key = decodeURIComponent(match[2])
    if (key.split('/').some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f]/.test(key)) return null
    return { bucket: match[1], key }
  } catch { return null }
}

export function collectNoteImageReferences(note) {
  const found = new Map()
  const add = value => {
    const ref = parseNoteImageReference(value)
    if (ref) found.set(`${ref.bucket}/${ref.key}`, ref)
  }
  const walk = value => {
    if (typeof value === 'string') {
      add(value)
      // HTML snapshots only; never modify or serialize the Y.Doc to HTML.
      for (const match of value.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(match[1])
    } else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([note.content, note.cover_url, note.background_image_url, note.files])
  if (note.state) {
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, new Uint8Array(note.state))
      const visit = value => {
        if (value instanceof Y.XmlElement) walk(value.getAttributes())
        if (typeof value?.toArray === 'function') value.toArray().forEach(visit)
        if (value instanceof Y.Map) for (const child of value.values()) visit(child)
      }
      // Tiptap uses this named XML fragment. Reading it does not alter state.
      visit(doc.getXmlFragment('default'))
    } finally { doc.destroy() }
  }
  return [...found.values()]
}
