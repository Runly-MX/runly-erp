// Collaborator identity on the canvas. Fuchsia is reserved for the local
// selection, so participants get their own stable colour (hash of the user id:
// the same person has the same colour on every screen and in every session).
export const PARTICIPANT_COLORS = ['#2563eb', '#059669', '#c2410c', '#0e7490', '#dc2626', '#4d7c0f', '#4f46e5', '#a16207', '#0f766e', '#9333ea']

const slot = userId => {
  let hash = 2166136261
  for (const char of String(userId)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0) % PARTICIPANT_COLORS.length
}
export const participantColor = userId => PARTICIPANT_COLORS[slot(userId)]

// Everyone present (the local user included, never drawn) takes their hashed
// colour; if two people collide, the later id in sorted order moves to the next
// free one. All clients see the same set of people, so they compute the same map.
export function assignColors(userIds) {
  const taken = new Set(), colors = new Map()
  for (const id of [...new Set(userIds)].sort()) {
    let index = slot(id)
    if (taken.size < PARTICIPANT_COLORS.length) while (taken.has(index)) index = (index + 1) % PARTICIPANT_COLORS.length
    taken.add(index); colors.set(id, PARTICIPANT_COLORS[index])
  }
  return colors
}

// One entry per person (several tabs of the same user collapse); newest session first.
// The local user's other tabs are marked `isSelf`: drawn on the canvas, never counted as collaborators.
export function groupParticipants(rows, selfId = null) {
  const people = new Map(), colors = assignColors([selfId, ...rows.map(row => row.userId)].filter(Boolean))
  for (const row of rows) {
    const isSelf = row.userId === selfId
    const person = people.get(row.userId) ?? { userId: row.userId, isSelf, name: isSelf ? 'Tú (otra pestaña)' : row.name || 'Colaborador', avatarUrl: row.avatarUrl ?? null, color: colors.get(row.userId), sessions: [] }
    person.sessions.push(row)
    people.set(row.userId, person)
  }
  return [...people.values()]
}

// object id -> people who currently have it selected (for canvas and Capas).
export function selectionsByObject(rows, selfId = null) {
  const map = new Map()
  for (const person of groupParticipants(rows, selfId)) {
    const ids = new Set(person.sessions.map(session => session.selectedId).filter(Boolean))
    for (const id of ids) map.set(id, [...(map.get(id) ?? []), person])
  }
  return map
}
