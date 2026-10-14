// Streaming parser for mysqldump output.
//
// Splits the input into statements with a resumable state machine (so huge
// extended INSERTs and multi-MB string literals never need a full-file buffer),
// then decodes `CREATE TABLE` column order and `INSERT INTO ... VALUES` rows.
// Every other statement (SET, LOCK, DROP, conditional comments, triggers) is
// ignored.
//
// Result shape:
//   { tables: { [name]: { columns: string[], types: { [col]: string }, rows: object[] } } }
//
// Value decoding: NULL -> null, integers -> number (string when outside the
// safe integer range), decimals -> number, quoted strings -> string (MySQL
// escapes decoded), `0x..` / `X'..'` -> Buffer, `_binary '...'` -> Buffer of the
// decoded text (exact only for UTF-8-valid payloads; sinabe has no BLOB columns),
// `b'0101'` -> number. Dates stay strings; typing is source.mjs' job.
import { createReadStream } from 'node:fs'

const STMT_STOP = /['"`;\n]/g
const STR_STOP = { "'": /['\\]/g, '"': /["\\]/g, '`': /`/g }
const SKIP = 0, START = 1, DASH = 2, SLASH = 3, LINE_COMMENT = 4, BLOCK = 5, BLOCK_STAR = 6, STMT = 7, STR = 8, ESC = 9

export function createDumpParser({ tables: only = null, onRow = null } = {}) {
  const wanted = only ? new Set(only) : null
  const result = { tables: {} }
  let mode = START, quote = '', parts = [], keep = null, delimiterSkip = false

  const tableFor = (name) => (result.tables[name] ??= { columns: [], types: {}, rows: [] })
  const decideKeep = () => {
    if (keep !== null) return
    const head = parts.join('').slice(0, 200)
    if (head.length < 40 && !head.includes('(')) return
    const m = /^\s*(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`([^`]+)`/i.exec(head)
    keep = !m || !wanted || wanted.has(m[1])
  }
  const finish = () => {
    const text = keep === false ? '' : parts.join('')
    parts = []; keep = null
    if (text) handleStatement(text)
  }
  const handleStatement = (text) => {
    const head = text.trimStart().slice(0, 16).toUpperCase()
    if (head.startsWith('CREATE TABLE')) return parseCreate(text)
    if (head.startsWith('INSERT') || head.startsWith('REPLACE')) return parseInsert(text)
  }
  const parseCreate = (text) => {
    const m = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`\s*\(/i.exec(text)
    if (!m || (wanted && !wanted.has(m[1]))) return
    const table = tableFor(m[1])
    table.columns = []; table.types = {}
    for (const line of text.slice(m.index + m[0].length).split('\n')) {
      const col = /^\s*`([^`]+)`\s+([a-z]+(?:\([^)]*\))?(?:\s+unsigned)?)/i.exec(line)
      if (!col) continue
      table.columns.push(col[1]); table.types[col[1]] = col[2].toLowerCase()
    }
  }
  const parseInsert = (text) => {
    const m = /^\s*(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`([^`]+)`\s*(\(([^)]*)\))?\s*VALUES\s*/i.exec(text)
    if (!m || (wanted && !wanted.has(m[1]))) return
    const table = tableFor(m[1])
    const cols = m[3] ? m[3].split(',').map((c) => c.trim().replace(/^`|`$/g, '')) : table.columns
    if (m[3] && !table.columns.length) table.columns = cols
    for (const values of iterateTuples(text, m.index + m[0].length)) {
      const row = {}
      for (let i = 0; i < values.length; i++) row[cols[i] ?? `c${i}`] = values[i]
      if (onRow) onRow(m[1], row)
      else table.rows.push(row)
    }
  }

  const push = (chunk) => {
    let i = 0, segStart = -1
    const n = chunk.length
    const flushSeg = (end) => { if (segStart >= 0 && end > segStart) parts.push(chunk.slice(segStart, end)); segStart = -1 }
    while (i < n) {
      if (mode === STMT) {
        if (segStart < 0) segStart = i
        STMT_STOP.lastIndex = i
        const hit = STMT_STOP.exec(chunk)
        if (!hit) { i = n; break }
        i = hit.index
        const c = chunk[i]
        if (c === ';') { flushSeg(i); finish(); mode = START; i++; continue }
        if (c === '\n') {
          i++
          if (parts.length === 0 && /^\s*DELIMITER\s/i.test(chunk.slice(segStart, i))) {
            delimiterSkip = !/^\s*DELIMITER\s+;\s*$/i.test(chunk.slice(segStart, i))
            segStart = -1; mode = delimiterSkip ? SKIP : START
          }
          continue
        }
        quote = c; mode = STR; i++; continue
      }
      if (mode === STR) {
        if (segStart < 0) segStart = i
        const re = STR_STOP[quote]
        re.lastIndex = i
        const hit = re.exec(chunk)
        if (!hit) { i = n; break }
        i = hit.index + 1
        if (chunk[hit.index] === '\\') mode = ESC
        else mode = STMT
        continue
      }
      if (mode === ESC) { if (segStart < 0) segStart = i; mode = STR; i++; continue }
      const c = chunk[i]
      if (mode === SKIP) {
        // Inside a DELIMITER block (triggers/routines): drop lines until `DELIMITER ;`.
        const nl = chunk.indexOf('\n', i)
        const line = (parts.join('') + chunk.slice(i, nl < 0 ? n : nl))
        if (nl < 0) { parts = [line]; i = n; break }
        parts = []
        if (/^\s*DELIMITER\s+;\s*$/i.test(line)) mode = START
        i = nl + 1; continue
      }
      if (mode === START) {
        if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';') { i++; continue }
        if (c === '#') { mode = LINE_COMMENT; i++; continue }
        if (c === '-') { mode = DASH; i++; continue }
        if (c === '/') { mode = SLASH; i++; continue }
        mode = STMT; continue
      }
      if (mode === DASH) {
        if (c === '-') { mode = LINE_COMMENT; i++; continue }
        parts.push('-'); mode = STMT; continue
      }
      if (mode === SLASH) {
        if (c === '*') { mode = BLOCK; i++; continue }
        parts.push('/'); mode = STMT; continue
      }
      if (mode === LINE_COMMENT) {
        const nl = chunk.indexOf('\n', i)
        if (nl < 0) { i = n; break }
        mode = START; i = nl + 1; continue
      }
      if (mode === BLOCK || mode === BLOCK_STAR) {
        if (mode === BLOCK_STAR && c === '/') { mode = START; i++; continue }
        mode = c === '*' ? BLOCK_STAR : BLOCK; i++; continue
      }
    }
    if (mode === STMT || mode === STR || mode === ESC) { flushSeg(n); decideKeep(); if (keep === false) parts = [] }
  }
  const end = () => {
    if (parts.length && mode !== SKIP) finish()
    return result
  }
  return { push, end, result }
}

// Yields the decoded value array of each `(...)` tuple after VALUES.
export function* iterateTuples(text, from = 0) {
  let i = from
  const n = text.length
  while (i < n) {
    while (i < n && text[i] !== '(' && text[i] !== ';') i++
    if (i >= n || text[i] === ';') return
    i++
    const values = []
    for (;;) {
      while (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t') i++
      const [value, next] = readValue(text, i)
      values.push(value)
      i = next
      while (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t') i++
      if (text[i] === ',') { i++; continue }
      if (text[i] === ')') { i++; break }
      throw new Error(`DUMP_PARSE_ERROR: unexpected token at offset ${i}`)
    }
    yield values
  }
}

const ESCAPES = { '0': '\0', n: '\n', r: '\r', t: '\t', Z: '\x1a', b: '\b' }

function readQuoted(text, i) {
  const q = text[i]
  let out = ''
  let j = i + 1
  let nextBs = -2
  for (;;) {
    // indexOf keeps multi-MB literals (base64 signatures) fast; the cached
    // backslash position avoids rescanning to the end on every escape.
    if (nextBs !== -1 && nextBs < j) nextBs = text.indexOf('\\', j)
    const nextQ = text.indexOf(q, j)
    if (nextQ < 0) throw new Error('DUMP_PARSE_ERROR: unterminated string')
    const k = nextBs !== -1 && nextBs < nextQ ? nextBs : nextQ
    out += text.slice(j, k)
    if (text[k] === '\\') {
      const e = text[k + 1]
      out += ESCAPES[e] ?? e
      j = k + 2
      continue
    }
    if (text[k + 1] === q) { out += q; j = k + 2; continue }
    return [out, k + 1]
  }
}

function readValue(text, i) {
  const c = text[i]
  if (c === "'" || c === '"') return readQuoted(text, i)
  if (text.startsWith('_binary', i)) {
    let j = i + 7
    while (text[j] === ' ') j++
    const [s, next] = readQuoted(text, j)
    return [Buffer.from(s, 'utf8'), next]
  }
  if ((c === 'X' || c === 'x') && text[i + 1] === "'") {
    const [s, next] = readQuoted(text, i + 1)
    return [Buffer.from(s, 'hex'), next]
  }
  if ((c === 'b' || c === 'B') && text[i + 1] === "'") {
    const [s, next] = readQuoted(text, i + 1)
    return [parseInt(s || '0', 2), next]
  }
  let j = i
  while (j < text.length && text[j] !== ',' && text[j] !== ')') j++
  const raw = text.slice(i, j).trim()
  if (raw === 'NULL' || raw === 'null') return [null, j]
  if (/^0x[0-9a-f]*$/i.test(raw)) return [Buffer.from(raw.slice(2), 'hex'), j]
  if (/^-?\d+$/.test(raw)) {
    const num = Number(raw)
    return [Number.isSafeInteger(num) ? num : raw, j]
  }
  if (/^-?\d*\.?\d+(?:e[+-]?\d+)?$/i.test(raw)) return [Number(raw), j]
  if (raw === 'TRUE' || raw === 'true') return [1, j]
  if (raw === 'FALSE' || raw === 'false') return [0, j]
  throw new Error(`DUMP_PARSE_ERROR: unknown literal at offset ${i}`)
}

export function parseDumpString(sql, options) {
  const parser = createDumpParser(options)
  parser.push(sql)
  return parser.end()
}

export async function readDump(filePath, options = {}) {
  const parser = createDumpParser(options)
  const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 })
  for await (const chunk of stream) parser.push(chunk)
  return parser.end()
}
