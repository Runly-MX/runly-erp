import { validateDocument } from '../../../../../shared/studio/document.js'

export function createDraftStorage(storage, scope, now = Date.now) {
  const key = `runly:studio:draft:${scope}`
  return {
    read() {
      try {
        const draft = JSON.parse(storage.getItem(key))
        if (!draft || draft.scope !== scope || !Number.isSafeInteger(draft.revision) || draft.revision < 1 ||
          typeof draft.name !== 'string' || draft.name.length > 160 || !Number.isFinite(draft.savedAt) ||
          now() - draft.savedAt > 7 * 24 * 60 * 60_000) return null
        return { ...draft, document: validateDocument(draft.document) }
      } catch { return null }
    },
    write(draft) {
      try { storage.setItem(key, JSON.stringify({ ...draft, document: validateDocument(draft.document), scope, savedAt: now() })); return true } catch { return false }
    },
    clear() { try { storage.removeItem(key) } catch { /* storage unavailable */ } },
  }
}
