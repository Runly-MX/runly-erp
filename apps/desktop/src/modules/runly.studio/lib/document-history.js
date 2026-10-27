import { documentPages, findPage, pageId, LEGACY_PAGE_ID } from '../../../../../shared/studio/pages.js'
import { validateDocument } from '../../../../../shared/studio/document.js'
import { applyOps, diffOps } from '../../../../../shared/studio/operations.js'

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
// Invert only values still owned by this action. A later collaborator wins a
// collision; undo never recreates an edited object removed by another session.
function selective(document,desired,expected) {
  const result=[]
  const key=op=>op.type==='upsert'?op.object.id:op.id
  for(const op of desired){
    const scene=findPage(document,op.pageId??LEGACY_PAGE_ID),objects=new Map((scene?.objects??[]).map(o=>[o.id,o]))
    if(op.type==='transferObjects'){
      const source=findPage(document,op.pageId),target=findPage(document,op.targetPageId),ids=new Set(op.ids)
      const forward=expected.find(e=>e.type==='transferObjects'&&e.pageId===op.targetPageId&&e.targetPageId===op.pageId)
      const selected=source?.objects.filter(o=>ids.has(o.id))??[],groups=new Set(selected.map(o=>o.groupId).filter(Boolean))
      if(forward&&target&&selected.length===ids.size&&!source.objects.some(o=>groups.has(o.groupId)&&!ids.has(o.id)))result.push(op)
      continue
    }
    if(op.type==='addPage'){
      const allIds=new Set(documentPages(document).flatMap(p=>p.objects.map(o=>o.id)))
      if(!findPage(document,pageId(op.scene))&&!op.scene.objects.some(o=>allIds.has(o.id)))result.push(op)
      continue
    }
    if(op.type==='removePage'){
      const forward=expected.find(e=>e.type==='addPage'&&pageId(e.scene)===op.pageId)
      if(documentPages(document).length>1&&forward&&same(scene,forward.scene))result.push(op)
      continue
    }
    if(op.type==='pageOrder'){
      const forward=expected.find(e=>e.type==='pageOrder'),actual=documentPages(document).map(pageId)
      if(forward&&same(actual.filter(id=>forward.ids.includes(id)),forward.ids.filter(id=>actual.includes(id))))result.push(op)
      continue
    }
    if(!scene)continue
    const other=expected.find(e=>(e.pageId??LEGACY_PAGE_ID)===(op.pageId??LEGACY_PAGE_ID)&&key(e)===key(op)&&(['patchPage','page','order'].includes(op.type)?e.type===op.type:true))
    if(op.type==='patch'||op.type==='patchPage'){
      const current=op.type==='patch'?objects.get(op.id):scene.page
      if(!current||!other)continue
      const matches=k=>same(current[k],other.set?.[k])
      const set=Object.fromEntries(Object.entries(op.set).filter(([k])=>matches(k))),unset=(op.unset??[]).filter(matches)
      if(Object.keys(set).length||unset.length)result.push({...op,set,unset})
    }else if(op.type==='remove'){
      if(other?.type==='upsert'&&same(objects.get(op.id),other.object))result.push(op)
    }else if(op.type==='upsert'){
      const current=objects.get(op.object.id)
      if(other?.type==='remove'?!current:other?.type==='upsert'&&same(current,other.object))result.push(op)
    }else if(op.type==='order'){
      const ids=new Set(other?.ids??[]),actual=scene.objects.map(o=>o.id).filter(id=>ids.has(id))
      if(same(actual,other?.ids.filter(id=>objects.has(id))))result.push(op)
    }
  }
  return result
}

// Selective undo for a shared document: each entry keeps the forward and
// inverse operations of one local change. Undo applies the inverse on top of
// the current document, so changes made meanwhile by collaborators (folded in
// with `rebase`) are kept. Granularity is the object: undoing an edit restores
// that object's previous version.
export function createDocumentHistory(initial, { limit = 50, maxBytes = 8_000_000 } = {}) {
  let base = validateDocument(initial), past = [], future = []
  const size = entry => JSON.stringify(entry).length * 2
  function trim() {
    while (past.length + future.length > limit || [...past, ...future].reduce((n, entry) => n + size(entry), 0) > maxBytes) {
      if (past.length) past.shift()
      else if (future.length) future.shift()
      else break
    }
  }
  const travel = direction => {
    const entry = (direction === 'undo' ? past : future).at(-1)
    return entry ? validateDocument(applyOps(base, selective(base,direction === 'undo' ? entry.inverse : entry.forward,direction === 'undo' ? entry.forward : entry.inverse))) : null
  }
  return {
    commit(document) {
      const next = validateDocument(document), forward = diffOps(base, next)
      if (!forward.length) return false
      past.push({ forward, inverse: diffOps(next, base) }); base = next; future = []; trim(); return true
    },
    // Collaborators' changes: move the baseline without creating an entry.
    rebase(ops) { if (ops.length) base = validateDocument(applyOps(base, ops)) },
    peek(direction) { return travel(direction) },
    move(direction) {
      const next = travel(direction)
      if (!next) return null
      const from = direction === 'undo' ? past : future, to = direction === 'undo' ? future : past
      from.pop()
      const forward=direction==='undo'?diffOps(next,base):diffOps(base,next),inverse=direction==='undo'?diffOps(base,next):diffOps(next,base)
      if(forward.length||inverse.length)to.push({forward,inverse})
      base = next; trim(); return next
    },
    state() { return { canUndo: past.length > 0, canRedo: future.length > 0, entries: past.length + future.length } },
  }
}
