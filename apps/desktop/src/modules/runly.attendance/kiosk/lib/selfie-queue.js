// Pure rules for the pending-selfie queue (evidence photos uploaded after the
// punch they belong to has reached the server).
export const MAX_PENDING_SELFIES = 200
export const MAX_SELFIE_ATTEMPTS = 5

const byAge = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)

// Oldest first; only photos whose punch left the outbox (accepted or rejected
// by the server) can be uploaded, and photos of rejected punches are skipped.
export function pickUploadable(selfies, outboxIds, rejectedIds = []) {
  const waiting = new Set(outboxIds)
  const rejected = new Set(rejectedIds)
  return [...selfies].sort(byAge).filter((s) => !waiting.has(s.punchId) && !rejected.has(s.punchId))
}

// Ids to drop so that at most `max` photos remain (oldest dropped first).
export function overflowIds(selfies, max = MAX_PENDING_SELFIES) {
  const extra = selfies.length - max
  return extra > 0 ? [...selfies].sort(byAge).slice(0, extra).map((s) => s.punchId) : []
}

// Outcome of one upload attempt: { action: 'delete' | 'keep' | 'drop', attempts }.
// 201 -> delete; 404/network/5xx -> keep and count; 401/403 -> keep without
// counting (kiosk auth issue); other 4xx (bad image) -> drop now.
export function resolveAttempt(attempts, status, max = MAX_SELFIE_ATTEMPTS) {
  if (status === 201 || status === 200) return { action: 'delete', attempts }
  if (status === 401 || status === 403) return { action: 'keep', attempts }
  if (status >= 400 && status < 500 && status !== 404 && status !== 408 && status !== 429) return { action: 'drop', attempts: attempts + 1 }
  const next = attempts + 1
  return next >= max ? { action: 'drop', attempts: next } : { action: 'keep', attempts: next }
}
