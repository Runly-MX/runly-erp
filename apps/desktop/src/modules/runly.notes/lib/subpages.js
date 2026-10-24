// Mirrors the API limit (apps/api/src/routes/notes/subpages.js): a root note is
// level 1 and a child of a level-3 note would be level 4.
export const MAX_NOTE_DEPTH = 3
export const MAX_DEPTH_HINT = 'Maximo 3 niveles'

// ancestorCount = ancestors of the open note (the chain stops at the first
// inaccessible one, so this can undercount; the API enforces the real limit).
export function canCreateSubpageAtDepth(ancestorCount) {
  return ancestorCount + 1 < MAX_NOTE_DEPTH
}

// Owner, or a collaborator with edit permission (list rows carry
// is_owner / my_share_permission; the detail row carries shares[]).
export function canEditNote(note, userId) {
  if (!note) return false
  if (note.is_owner === true) return true
  if (note.is_owner === undefined && userId && note.owner_user_id === userId) return true
  if (note.my_share_permission === 'edit') return true
  return Array.isArray(note.shares) && note.shares.some((s) => s.userId === userId && s.permission === 'edit')
}
