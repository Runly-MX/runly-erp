// "/module:query" shortcuts in the chat composer. A source is
// { key, label, aliases: string[], Icon, color, search(query) -> rows }.
// A source with `command: true` is a chat command ("/estado ..."): it is only offered at the
// start of the message, has a `description`, and never opens a record search.

const normalize = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function findSource(sources, alias) {
  const key = normalize(alias)
  return sources.find((s) => s.aliases.some((a) => normalize(a) === key)) ?? null
}

// Reads the text before the caret. `start` is the index of the "/".
//   "/inv"            -> phase "source" (pick a module)
//   "/inventarios:jf" -> phase "search" (query "jf")
//   "/inventarios jf" -> same, a space works as separator too
// A "/" glued to a word ("y/o", "http://") never triggers.
export function parseSlashContext(before, sources) {
  const start = before.lastIndexOf('/')
  if (start < 0) return null
  if (start > 0 && !/\s/.test(before[start - 1])) return null
  const seg = before.slice(start + 1)
  if (seg.includes('\n')) return null
  if (!/[\s:]/.test(seg)) return { phase: 'source', query: seg, start }
  const m = seg.match(/^([^\s:]+)[\s:](.*)$/)
  if (!m) return null
  const source = findSource(sources, m[1])
  if (!source || source.command) return null
  return { phase: 'search', source, query: m[2].slice(0, 60), start }
}

export function slashSourceRows(sources, query, atStart = false) {
  const q = normalize(query)
  return (sources ?? [])
    .filter((s) => atStart || !s.command)
    .filter((s) => !q || s.aliases.some((a) => normalize(a).startsWith(q)) || normalize(s.label).startsWith(q))
    .map((s) => ({
      id: `source:${s.key}`,
      displayName: s.label,
      description: s.command ? (s.description ?? `/${s.aliases[0]}`) : `/${s.aliases[0]}:`,
      kind: 'source',
      Icon: s.Icon,
      color: s.color,
      source: s,
    }))
}
