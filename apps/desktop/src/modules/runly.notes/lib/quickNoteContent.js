const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Attached photos: a URL string or { url, aspectRatio?, alt? }. Emitted as
// plain <img> tags (the editor image node parses img[src] and data-aspect-ratio).
function imagesHtml(images) {
  return images
    .map((img) => (typeof img === 'string' ? { url: img } : img))
    .filter((img) => img?.url)
    .map((img) => {
      const ratio = Number(img.aspectRatio)
      const ratioAttr = Number.isFinite(ratio) && ratio > 0 ? ` data-aspect-ratio="${ratio}"` : ''
      return `<img src="${esc(img.url)}" alt="${esc(img.alt ?? '')}"${ratioAttr}>`
    })
    .join('')
}

const PHOTO_TITLE = 'Nota con foto'

// The note title is the first paragraph (see NoteEditor handleUpdate), so the
// composer emits it as the first <p>. Returns null when there is nothing to save.
export function buildQuickNoteContent({ mode, title = '', body = '', items = [], images = [] }) {
  const t = title.trim()
  const imgHtml = imagesHtml(images)
  if (mode === 'checklist') {
    const rows = items.filter(i => i.text.trim())
    if (!t && rows.length === 0 && !imgHtml) return null
    const lis = rows.map(i =>
      `<li data-checked="${i.checked ? 'true' : 'false'}" data-type="taskItem"><label><input type="checkbox"${i.checked ? ' checked' : ''}><span></span></label><div><p>${esc(i.text.trim())}</p></div></li>`,
    ).join('')
    const resolvedTitle = t || rows[0]?.text.trim() || PHOTO_TITLE
    const list = rows.length ? `<ul data-type="taskList">${lis}</ul>` : ''
    return { title: resolvedTitle, content: `<p>${esc(resolvedTitle)}</p>${list}${imgHtml}` }
  }
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  if (!t && lines.length === 0 && !imgHtml) return null
  if (!t && lines.length === 0) return { title: PHOTO_TITLE, content: `<p>${PHOTO_TITLE}</p>${imgHtml}` }
  if (!t) {
    const [first, ...rest] = lines
    return { title: first, content: `<p>${esc(first)}</p>${rest.map(l => `<p>${esc(l)}</p>`).join('')}${imgHtml}` }
  }
  return { title: t, content: `<p>${esc(t)}</p>${lines.map(l => `<p>${esc(l)}</p>`).join('')}${imgHtml}` }
}
