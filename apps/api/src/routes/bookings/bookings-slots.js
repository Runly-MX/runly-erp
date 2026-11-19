// Pure interval arithmetic for runly.bookings availability. Ranges are half-open
// { start, end } in epoch milliseconds: [start, end). Wall-clock -> instant
// conversion happens in Postgres (AT TIME ZONE) before anything reaches here.

export function normalize(ranges) {
  const sorted = ranges.filter((r) => r.end > r.start).map((r) => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start)
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push(r)
  }
  return out
}

export function union(a, b) {
  return normalize([...a, ...b])
}

export function intersect(a, b) {
  const x = normalize(a), y = normalize(b), out = []
  let i = 0, j = 0
  while (i < x.length && j < y.length) {
    const start = Math.max(x[i].start, y[j].start), end = Math.min(x[i].end, y[j].end)
    if (end > start) out.push({ start, end })
    if (x[i].end < y[j].end) i++
    else j++
  }
  return out
}

export function subtract(a, b) {
  let out = normalize(a)
  for (const cut of normalize(b)) {
    out = out.flatMap((r) => {
      if (cut.end <= r.start || cut.start >= r.end) return [r]
      return [{ start: r.start, end: cut.start }, { start: cut.end, end: r.end }].filter((p) => p.end > p.start)
    })
  }
  return out
}

export const overlaps = (a, b) => a.start < b.end && b.start < a.end

// Effective hours of one owner: rules plus `open` exceptions minus `closed` ones.
// null = the owner defines no hours of its own (does not restrict).
function effective({ rules = [], open = [], closed = [] }) {
  if (!rules.length && !open.length) return null
  return subtract(union(rules, open), closed)
}

// A resource is bookable where the space and the resource are both open.
// Neither defining hours means nothing is bookable.
export function resourceWindows({ space = {}, resource = {} }) {
  const s = effective(space), r = effective(resource)
  if (!s && !r) return []
  const closedEverywhere = [...(space.closed ?? []), ...(resource.closed ?? [])]
  if (!s) return subtract(r, closedEverywhere)
  if (!r) return subtract(s, closedEverywhere)
  return intersect(s, r)
}

export function fitsWindow(windows, start, end) {
  return windows.some((w) => w.start <= start && end <= w.end)
}

// Candidate starts every `stepMs` from each window start. The service time must
// lie inside the window; the buffered range must not touch any busy range.
export function cutSlots({ windows, busy = [], durationMs, bufferBeforeMs = 0, bufferAfterMs = 0, stepMs, notBefore = -Infinity, notAfter = Infinity }) {
  if (!(durationMs > 0) || !(stepMs > 0)) return []
  const taken = normalize(busy), slots = []
  for (const w of normalize(windows)) {
    for (let start = w.start; start + durationMs <= w.end; start += stepMs) {
      if (start < notBefore || start > notAfter) continue
      const occupied = { start: start - bufferBeforeMs, end: start + durationMs + bufferAfterMs }
      if (taken.some((t) => overlaps(t, occupied))) continue
      slots.push({ start, end: start + durationMs })
    }
  }
  return slots
}
