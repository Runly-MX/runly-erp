import { validateDocument } from '../../../../../shared/studio/document.js'
import {applyOps,checkOps} from '../../../../../shared/studio/operations.js'

export function recoverDraftDocument(document,draft){
  if(!draft.operations)return validateDocument(draft.document)
  const current=validateDocument(document),ops=checkOps(draft.operations,10000),ids=new Set(current.objects.map(o=>o.id))
  for(const op of ops){
    if(op.type==='upsert')ids.add(op.object.id)
    else if(op.type==='remove')ids.delete(op.id)
    else if(op.type==='patch'&&!ids.has(op.id))throw Error('La copia local incluye objetos eliminados por otra sesión. Se conserva para una recuperación independiente; no se aplicó ni descartó el borrador.')
  }
  return validateDocument(applyOps(current,ops))
}

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
