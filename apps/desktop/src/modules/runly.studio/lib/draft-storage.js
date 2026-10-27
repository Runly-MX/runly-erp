import {findPage, LEGACY_PAGE_ID} from '../../../../../shared/studio/pages.js'
import { validateDocument } from '../../../../../shared/studio/document.js'
import {applyOps,checkOps} from '../../../../../shared/studio/operations.js'

export function recoverDraftDocument(document,draft){
  if(!draft.operations)return validateDocument(draft.document)
  const current=validateDocument(document),ops=checkOps(draft.operations,10000),ids=new Set(current.objects.map(o=>o.id))
  let staged=current
  for(const op of ops){
    const scene=findPage(staged,op.pageId??LEGACY_PAGE_ID)
    if(op.pageId && !scene && !['addPage','pageOrder','removePage'].includes(op.type))throw Error('La copia local incluye páginas eliminadas. Se conserva para recuperación independiente.')
    ids.clear(); for(const object of scene?.objects??[])ids.add(object.id)
    if(op.type==='upsert')ids.add(op.object.id)
    else if(op.type==='remove')ids.delete(op.id)
    else if(op.type==='patch'&&!ids.has(op.id))throw Error('La copia local incluye objetos eliminados por otra sesión. Se conserva para una recuperación independiente; no se aplicó ni descartó el borrador.')
    staged=applyOps(staged,[op])
  }
  return validateDocument(staged)
}

export function createDraftStorage(storage, scope, now = Date.now) {
  const key = `runly:studio:draft:${scope}`
  return {
    read() {
      try {
        const draft = JSON.parse(storage.getItem(key))
        if (!draft || draft.scope !== scope || !Number.isSafeInteger(draft.revision) || draft.revision < 1 ||
          typeof draft.name !== 'string' || draft.name.length > 160 || !Number.isFinite(draft.savedAt) ||
          draft.savedAt > now() + 60_000) return null
        return { ...draft, document: validateDocument(draft.document) }
      } catch { return null }
    },
    write(draft) {
      try { storage.setItem(key, JSON.stringify({ ...draft, document: validateDocument(draft.document), scope, savedAt: now() })); return true } catch { return false }
    },
    clear() { try { storage.removeItem(key) } catch { /* storage unavailable */ } },
  }
}

// Unreviewed copies are independent of the current autosave slot. A successful
// server fetch or new edits must not erase an older, still-unreviewed scene.
export function sameDraft(a,b){
  const value=d=>d&&({name:d.name,revision:d.revision,document:validateDocument(d.document),operations:d.operations})
  return Boolean(a&&b)&&JSON.stringify(value(a))===JSON.stringify(value(b))
}
export function createDraftArchive(storage,scope){
  const key=`runly:studio:recovery:${scope}`
  function entries(){const raw=storage.getItem(key);if(!raw)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('Invalid recovery archive');return rows.map(d=>({...d,document:validateDocument(d.document)}))}
  return {
    read(){try{return entries()[0]??null}catch{return null}},
    stash(draft){try{const rows=entries();if(!rows.some(d=>sameDraft(d,draft)))storage.setItem(key,JSON.stringify([...rows,{...draft,document:validateDocument(draft.document)}]));return true}catch{return false}},
    remove(draft){try{const rows=entries().filter(d=>!sameDraft(d,draft));if(rows.length)storage.setItem(key,JSON.stringify(rows));else storage.removeItem(key);return true}catch{return false}},
  }
}
