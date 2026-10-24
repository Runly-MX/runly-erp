// A root note has depth 1; a child of a root has depth 2, and so on.
export const MAX_DEPTH = 3
export const MAX_DEPTH_MESSAGE = 'No se pueden anidar mas de 3 niveles.'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

// parentDepth = number of notes in the chain from the root down to the intended
// parent (the parent included). A child of a depth-3 note would be level 4.
export function exceedsDepth(parentDepth) {
  return parentDepth >= MAX_DEPTH
}

// The archive flag cascades to sub-pages only when the request really flips it.
// Un-archiving brings back every archived descendant (simplification: there is
// no archived_at to tell pages archived together from earlier ones).
export function shouldCascadeArchive(current, data) {
  if (!current || typeof data?.isArchived !== 'boolean') return false;
  return Boolean(current.is_archived) !== data.isArchived;
}
