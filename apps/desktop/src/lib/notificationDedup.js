// The same logical notification can reach the browser over the Supabase
// `notification.new` broadcast, web push (service worker), FCM and local system
// notifications. This shared, module-level guard collapses them: whichever path
// fires first "claims" the key for a short window and the others skip.

const seen = new Map(); // key -> expiry timestamp

// Identity, strongest first:
//   n:<notificationId>:<count>  the recipient's own row. count distinguishes the
//     successive messages a chat conversation folds into one row, so two
//     legitimate alerts are never merged just because their text is equal.
//   dk:<dedupeKey>              producer-supplied logical key (older payloads).
//   c:<type|title|body>         last resort for payloads that carry neither.
export function notificationKey(n) {
  if (!n) return null;
  const id = n.notificationId ?? n.id;
  if (id) return `n:${id}:${n.count ?? n.metadata?.count ?? 1}`;
  if (n.dedupeKey) return `dk:${n.dedupeKey}`;
  const parts = [n.eventType ?? "", n.title ?? "", n.body ?? ""];
  if (!parts.some(Boolean)) return null;
  return `c:${parts.join("|")}`;
}

export function claimNotification(key, windowMs = 6000) {
  if (!key) return true; // no key -> can't dedupe, let it through
  const now = Date.now();
  if (seen.size > 200) {
    for (const [k, exp] of seen) if (exp < now) seen.delete(k);
  }
  const exp = seen.get(key);
  if (exp && exp > now) return false; // already claimed by another surface
  seen.set(key, now + windowMs);
  return true;
}
