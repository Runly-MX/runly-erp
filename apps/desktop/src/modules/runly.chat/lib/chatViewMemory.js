// ChatScreen mounts ChatWindow in a different tree on phones (SwipeBackStack)
// than on wider screens (side by side), so rotating a phone across that
// breakpoint unmounts and remounts it — and every view opened inside the
// conversation (Archivos, Grabaciones, the profile panel) was lost, dropping
// the user back on the message list. The last open view is kept here and
// restored only on an immediate remount of the same conversation, so leaving
// a conversation and coming back later still opens it on its messages.
const REMOUNT_WINDOW_MS = 2000;

let remembered = null;

export function rememberChatView(state) {
  remembered = { ...state, unmountedAt: null };
}

export function markChatViewUnmounted(conversationId) {
  if (remembered?.conversationId === conversationId) remembered.unmountedAt = Date.now();
}

// React renders the new tree before it runs the old tree's unmount cleanup,
// so on a remount the previous instance is usually still "mounted" here
// (unmountedAt null) — that counts as a remount too.
export function recallChatView(conversationId, now = Date.now()) {
  if (!remembered || remembered.conversationId !== conversationId) return null;
  if (remembered.unmountedAt == null) return remembered;
  return now - remembered.unmountedAt <= REMOUNT_WINDOW_MS ? remembered : null;
}
