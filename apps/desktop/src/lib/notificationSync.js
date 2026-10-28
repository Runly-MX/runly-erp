// Client-side state sync for the notification counters.
//
// Persistence (API + PostgreSQL) is the source of truth. A broadcast only says
// "something changed": it gives instant feedback on the badge, and an
// authoritative refresh (GET /notifications/summary) always follows. Anything
// that is lost (a dropped broadcast, a suspended tab) is repaired by the same
// refresh on reconnect, on visibility and by the slow heartbeat.

export const NOTIFICATION_SUMMARY_KEY = ["notifications", "summary"];

const REFRESH_WINDOW_MS = 1000;
const SEEN_LIMIT = 500;
const seenIds = new Set();
const schedulers = new WeakMap();

export function notificationCategory(eventType) {
  return String(eventType ?? "").startsWith("chat.") ? "messages" : "general";
}

function bump(summary, category, delta) {
  if (!summary) return summary;
  const by = summary.unreadByCategory ?? {};
  return {
    ...summary,
    unreadCount: Math.max(0, (summary.unreadCount ?? 0) + delta),
    unreadByCategory: { ...by, [category]: Math.max(0, (by[category] ?? 0) + delta) },
  };
}

// Optimistic +1 for a brand-new unread row. Idempotent per notification id, and
// never applied for an update of a row that is already counted (count > 1).
export function applyIncomingNotification(queryClient, payload) {
  const id = payload?.notificationId;
  if (!id || (payload.count ?? 1) > 1 || seenIds.has(id)) return false;
  seenIds.add(id);
  if (seenIds.size > SEEN_LIMIT) seenIds.clear();
  queryClient.setQueriesData({ queryKey: NOTIFICATION_SUMMARY_KEY }, (current) =>
    bump(current, notificationCategory(payload.eventType), 1));
  return true;
}

// Optimistic read-state changes with a snapshot to roll back to.
export function applyReadChange(queryClient, { all = false, category = null } = {}) {
  const snapshot = queryClient.getQueriesData({ queryKey: NOTIFICATION_SUMMARY_KEY });
  queryClient.setQueriesData({ queryKey: NOTIFICATION_SUMMARY_KEY }, (current) => {
    if (!current) return current;
    if (all) return { ...current, unreadCount: 0, unreadByCategory: { messages: 0, general: 0 } };
    return category ? bump(current, category, -1) : current;
  });
  return () => { for (const [key, value] of snapshot) queryClient.setQueryData(key, value); };
}

function refreshNow(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["notifications"] }, { cancelRefetch: false });
  queryClient.invalidateQueries({ queryKey: ["notifications-inbox"] }, { cancelRefetch: false });
}

// Leading + trailing refresh, at most one per window: the first event refreshes
// immediately, the rest of a burst collapses into one trailing refresh that is
// guaranteed to run after the last event. Only mounted (enabled) queries refetch.
export function refreshNotifications(queryClient) {
  let state = schedulers.get(queryClient);
  if (!state) { state = { last: 0, timer: null }; schedulers.set(queryClient, state); }
  if (state.timer) return;
  const wait = REFRESH_WINDOW_MS - (Date.now() - state.last);
  const run = () => { state.timer = null; state.last = Date.now(); refreshNow(queryClient); };
  if (wait <= 0) run();
  else state.timer = setTimeout(run, wait);
}

export function summaryRefetchInterval() {
  // Safety net only (bounds how long a lost broadcast can stay invisible);
  // hidden tabs do not poll, they reconcile when they become visible.
  return typeof document !== "undefined" && document.visibilityState === "visible" ? 120_000 : false;
}
