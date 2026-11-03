// Per-tab copy of the user's unsaved page so a conflict, 401 or network
// failure never loses work. Keyed by company/site/page/revision; every access
// is guarded because storage can be blocked or full.

const key = (companyId, siteId, pageId) => `runly-website-draft:${companyId ?? 'x'}:${siteId}:${pageId}`

export function writeBackup(companyId, siteId, pageId, payload) {
  try {
    sessionStorage.setItem(key(companyId, siteId, pageId), JSON.stringify({ ...payload, at: Date.now() }))
    return true
  } catch {
    return false
  }
}

export function readBackup(companyId, siteId, pageId) {
  try {
    const raw = sessionStorage.getItem(key(companyId, siteId, pageId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearBackup(companyId, siteId, pageId) {
  try { sessionStorage.removeItem(key(companyId, siteId, pageId)) } catch { /* storage blocked */ }
}
