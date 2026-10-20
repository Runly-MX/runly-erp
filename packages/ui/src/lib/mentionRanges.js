// Mentions and record links in the chat composer are plain text in the field
// ("@Ana", "Asus TUF 15") with their identity kept beside it as ranges, like
// WhatsApp: the text stays readable, the chip look is drawn from the ranges.
//
//   serialized  "mira @[uuid:Ana] y #[inventory_item:uuid:Asus TUF 15]"
//   text        "mira @Ana y Asus TUF 15"
//   ranges      [{ kind: "user", id, start: 5, end: 9 },
//                { kind: "entity", entityType, id, start: 12, end: 24 }]
import { ENTITY_TOKEN_SOURCE } from './entityTokenParse.js'

const USER_TOKEN_SOURCE = /@\[([a-f0-9-]{36}):([^\]]+)\]/.source
const COMBINED_SOURCE = `${USER_TOKEN_SOURCE}|${ENTITY_TOKEN_SOURCE}`

// "[" and "]" would break the stored token, so they never reach a chip name.
export const chipName = (name) => String(name ?? '').replace(/[[\]]/g, '').trim()

export function parseSerialized(serialized) {
  let text = ''
  const ranges = []
  const re = new RegExp(COMBINED_SOURCE, 'g')
  const source = serialized ?? ''
  let last = 0
  let match
  while ((match = re.exec(source)) !== null) {
    text += source.slice(last, match.index)
    const start = text.length
    if (match[3]) {
      text += match[5]
      ranges.push({ kind: 'entity', entityType: match[3], id: match[4], start, end: text.length })
    } else {
      text += `@${match[2]}`
      ranges.push({ kind: 'user', id: match[1], start, end: text.length })
    }
    last = match.index + match[0].length
  }
  text += source.slice(last)
  return { text, ranges }
}

export function serializeRanges(text, ranges) {
  let out = ''
  let pos = 0
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    out += text.slice(pos, r.start)
    const shown = text.slice(r.start, r.end)
    out += r.kind === 'user'
      ? `@[${r.id}:${shown.replace(/^@/, '')}]`
      : `#[${r.entityType}:${r.id}:${shown}]`
    pos = r.end
  }
  return out + text.slice(pos)
}

// The user changed the field from `oldText` to `newText` (typing, paste, cut,
// delete...). Ranges before the edit stay, ranges after it shift. A chip the
// edit deletes into goes away whole (backspace removes the entire mention);
// typing inside a chip just turns it back into ordinary text.
export function applyEdit(oldText, newText, ranges) {
  if (oldText === newText) return { text: newText, ranges, caret: null }
  const max = Math.min(oldText.length, newText.length)
  let prefix = 0
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix += 1
  let suffix = 0
  while (suffix < max - prefix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix += 1
  const oldEnd = oldText.length - suffix
  const insertedLen = newText.length - suffix - prefix
  const delta = newText.length - oldText.length

  const kept = []
  const cuts = []
  for (const r of ranges) {
    if (r.end <= prefix) { kept.push(r); continue }
    if (r.start >= oldEnd) {
      kept.push({ ...r, start: r.start + delta, end: r.end + delta })
      continue
    }
    // The edit touches this chip.
    if (insertedLen === 0) {
      const start = r.start < prefix ? r.start : prefix
      const end = r.end > oldEnd ? r.end + delta : prefix
      cuts.push([start, end])
    }
    // else: typed/pasted over it - the text stays, the chip is dropped.
  }

  let text = newText
  let caret = null
  let result = kept
  for (const [start, end] of cuts.sort((a, b) => b[0] - a[0])) {
    text = text.slice(0, start) + text.slice(end)
    const size = end - start
    result = result
      .filter((r) => !(r.start >= start && r.end <= end))
      .map((r) => (r.start >= end ? { ...r, start: r.start - size, end: r.end - size } : r))
    caret = start
  }
  return { text, ranges: result, caret }
}

// Replaces text[start, end) with `insert`; when `chip` is given, the inserted
// text becomes that chip. Used when picking a result from the dropdown.
export function replaceRange(text, ranges, start, end, insert, chip = null) {
  const delta = insert.length - (end - start)
  const next = ranges
    .filter((r) => r.end <= start || r.start >= end)
    .map((r) => (r.start >= end ? { ...r, start: r.start + delta, end: r.end + delta } : r))
  if (chip) next.push({ ...chip, start, end: start + insert.length })
  return { text: text.slice(0, start) + insert + text.slice(end), ranges: next }
}

// True when index falls inside a chip (so a "/" or "@" there is not a trigger).
export const insideChip = (ranges, index) => ranges.some((r) => index >= r.start && index < r.end)
