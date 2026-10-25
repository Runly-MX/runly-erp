// Helpers shared by the document template manager components.

export const FORMAT_LABELS = { docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', pdf: 'PDF' }
export const ALL_FORMATS = ['docx', 'xlsx', 'pptx', 'pdf']
export const BLANK_FORMATS = ['docx', 'xlsx', 'pptx']
export const MAX_TEMPLATE_MB = 10

export const formatOfName = (name) => {
  const match = /\.(docx|xlsx|pptx|pdf)$/i.exec(name ?? '')
  return match ? match[1].toLowerCase() : null
}

export const FORMAT_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
}

// Extensions plus MIME types: some file dialogs filter by type, not by extension,
// and would hide Word/Excel/PowerPoint files when only extensions are given.
export const acceptFor = (formats) => (formats?.length ? formats : ALL_FORMATS)
  .flatMap((f) => [`.${f}`, FORMAT_MIME[f]].filter(Boolean)).join(',')

// Field of a kind schema -> option list for the "data field" selector.
export function schemaOptions(kind, listName = null) {
  const schema = kind?.schema ?? []
  if (listName) {
    const list = schema.find((entry) => entry.tag === listName && entry.type === 'list')
    return (list?.fields ?? []).map((f) => ({ value: f.tag, label: f.label ?? f.tag }))
  }
  return schema.map((entry) => ({
    value: entry.tag,
    label: entry.type === 'list' ? `${entry.label} (lista)` : entry.label,
  }))
}

// Template tags that the kind does not know yet: these need a mapping.
export function unknownTags(kind, placeholders) {
  if (kind?.freeTags) return []
  const schema = kind?.schema ?? []
  const top = new Set(schema.map((entry) => entry.tag))
  const nested = new Map(schema.filter((e) => e.type === 'list').map((e) => [e.tag, new Set((e.fields ?? []).map((f) => f.tag))]))
  return (placeholders ?? []).filter((tag) => {
    if (typeof tag !== 'string' || !tag) return false
    const dot = tag.indexOf('.')
    if (dot === -1) return !top.has(tag)
    const fields = nested.get(tag.slice(0, dot))
    return fields ? !fields.has(tag.slice(dot + 1)) : !top.has(tag.slice(0, dot))
  })
}

// True when the file has no tag the kind understands (free-tag kinds never do).
export function hasNoKnownTags(kind, template) {
  if (!kind || kind.freeTags) return false
  const tags = template?.version?.placeholders ?? []
  return tags.length - unknownTags(kind, tags).length === 0
}

export function tagText(entry) {
  if (entry.type === 'list') return `{{#${entry.tag}}} ... {{/${entry.tag}}}`
  if (entry.type === 'image') return `{{%${entry.tag}}}`
  return `{{${entry.tag}}}`
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function base64ToFile(base64, fileName, type) {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0))
  return new File([bytes], fileName, { type })
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const errorText = (error, fallback) => error?.message || fallback
