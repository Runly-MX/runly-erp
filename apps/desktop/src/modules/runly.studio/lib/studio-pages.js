// Pure helpers for the page browser: labels, content signatures, ranges, ordering.

export const pageLabel = (page, index) => (page.name?.trim() ? page.name.trim() : `Página ${index + 1}`)

// Stable content identity of a page scene (thumbnails are redrawn only when it changes).
export function pageSignature(scene) {
  const text = JSON.stringify(scene)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  return `${text.length}:${hash.toString(16)}`
}

// Content identifiers (not database rows): the engine needs caller-provided stable ids.
export function newContentId(prefix = 'p') {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

// "1-3, 5" -> ids in document order, without duplicates.
export function parsePageRange(text, ids) {
  const source = String(text ?? '').trim()
  if (!source) return { error: 'Escribe las páginas, por ejemplo 1-3, 5.' }
  const picked = new Set()
  for (const part of source.split(/[,;]/).map(item => item.trim()).filter(Boolean)) {
    const match = /^(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/.exec(part)
    if (!match) return { error: `«${part}» no es un rango válido. Usa números como 1-3, 5.` }
    const from = Number(match[1]), to = match[2] === undefined ? from : Number(match[2])
    if (from < 1 || to < from) return { error: `«${part}» no es un rango válido: el inicio debe ser menor o igual al final.` }
    if (to > ids.length) return { error: `La página ${to} no existe: el diseño tiene ${ids.length}.` }
    for (let number = from; number <= to; number += 1) picked.add(ids[number - 1])
  }
  return { ids: ids.filter(id => picked.has(id)) }
}

export function moveId(ids, id, toIndex) {
  const from = ids.indexOf(id)
  if (from < 0) return ids
  const target = Math.max(0, Math.min(ids.length - 1, toIndex)), next = ids.filter(item => item !== id)
  next.splice(target, 0, id)
  return next
}
