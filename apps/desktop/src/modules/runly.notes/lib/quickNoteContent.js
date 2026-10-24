const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The note title is the first paragraph (see NoteEditor handleUpdate), so the
// composer emits it as the first <p>. Returns null when there is nothing to save.
export function buildQuickNoteContent({ mode, title = '', body = '', items = [] }) {
  const t = title.trim()
  if (mode === 'checklist') {
    const rows = items.filter(i => i.text.trim())
    if (!t && rows.length === 0) return null
    const lis = rows.map(i =>
      `<li data-checked="${i.checked ? 'true' : 'false'}" data-type="taskItem"><label><input type="checkbox"${i.checked ? ' checked' : ''}><span></span></label><div><p>${esc(i.text.trim())}</p></div></li>`,
    ).join('')
    const resolvedTitle = t || rows[0].text.trim()
    return { title: resolvedTitle, content: `<p>${esc(resolvedTitle)}</p><ul data-type="taskList">${lis}</ul>` }
  }
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  if (!t && lines.length === 0) return null
  if (!t) {
    const [first, ...rest] = lines
    return { title: first, content: `<p>${esc(first)}</p>${rest.map(l => `<p>${esc(l)}</p>`).join('')}` }
  }
  return { title: t, content: `<p>${esc(t)}</p>${lines.map(l => `<p>${esc(l)}</p>`).join('')}` }
}
