// Returns the previous note object when only server-driven noise changed
// (updated_at, content, word counts). The editor owns content and title while
// it is open, so those fields must not re-feed it.
const EDITOR_RELEVANT = ['id', 'title', 'icon', 'cover_url', 'background_color', 'paper_style', 'paper_margin', 'is_public', 'public_slug', 'owner_user_id', 'note_type', 'folder_id', 'is_pinned']

export function nextSelectedNote(prev, incoming) {
  if (!prev || prev.id !== incoming.id) return incoming
  const same = EDITOR_RELEVANT.every((k) => prev[k] === incoming[k])
  return same ? prev : incoming
}
