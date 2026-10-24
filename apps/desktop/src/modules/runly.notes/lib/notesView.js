import { extractPreview } from './notePreview.js'

export function splitPinned(notes) {
  const pinned = []
  const others = []
  for (const n of notes) (n.is_pinned ? pinned : others).push(n)
  return { pinned, others }
}

// type: 'document' | 'canvas'; color: stored background hex; hasImage / hasChecklist: booleans.
export function applyClientFilters(notes, { type, color, hasImage, hasChecklist } = {}) {
  return notes.filter((n) => {
    if (type && n.note_type !== type) return false
    if (color && n.background_color !== color) return false
    if (hasImage || hasChecklist) {
      const p = extractPreview(n.content, n.title)
      if (hasImage && !p.firstImage) return false
      if (hasChecklist && !p.checklist) return false
    }
    return true
  })
}
