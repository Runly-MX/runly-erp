import { documentPages, withPages, pageId, LEGACY_PAGE_ID } from './pages.js'
// Object-level operations for real-time collaboration. Pure and deterministic:
// the server sequences batches and every client replays the same functions.
//   {type:'upsert', object}   replace by id, or append a new object
//   {type:'remove', id}       delete (unknown ids are ignored)
//   {type:'order', ids}       stacking of the listed ids; unlisted objects keep their slots
//   {type:'page', page}       page size and background
// The caller validates the resulting document (validateDocument).

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// The slots held by the listed ids are refilled in the listed order.
export function orderSlots(objects, ids) {
  const byId = new Map(objects.map(object => [object.id, object])), seen = new Set()
  const listed = ids.filter(id => byId.has(id) && !seen.has(id) && seen.add(id))
  const slots = objects.map((object, index) => (seen.has(object.id) ? index : -1)).filter(index => index >= 0)
  const result = [...objects]
  slots.forEach((slot, index) => { result[slot] = byId.get(listed[index]) })
  return result
}

function editScene(scene, op) {
  let page = scene.page, objects = [...scene.objects]
  if (op.type === 'page') page = {...op.page, id: page.id}
  else if (op.type === 'patchPage') page = {...patchProperties(page, op), id: page.id}
  else if (op.type === 'patch') objects = objects.map(object => object.id === op.id ? patchProperties(object, op) : object)
  else if (op.type === 'remove') objects = objects.filter(object => object.id !== op.id)
  else if (op.type === 'upsert') {
    const index = objects.findIndex(object => object.id === op.object.id)
    if (index >= 0) objects[index] = op.object
    else objects.push(op.object)
  } else if (op.type === 'order') objects = orderSlots(objects, op.ids)
  else throw Error('Operación de diseño no admitida.')
  return {page, objects}
}
function copyObjects(objects, prefix) {
  const groups = [...new Set(objects.map(object => object.groupId).filter(Boolean))]
  return objects.map((object, index) => ({...object, id: `${prefix}-o${index + 1}`,
    ...(object.groupId ? {groupId: `${prefix}-g${groups.indexOf(object.groupId) + 1}`} : {})}))
}
export function applyOps(document, ops) {
  let pages = documentPages(document)
  for (const op of ops) {
    if (op.type === 'addPage') {
      if (!pages.some(scene => pageId(scene) === pageId(op.scene))) {
        const index = op.afterId ? pages.findIndex(scene => pageId(scene) === op.afterId) : pages.length - 1
        pages = [...pages.slice(0, index + 1), op.scene, ...pages.slice(index + 1)]
      }
    } else if (op.type === 'duplicatePage') {
      const source = pages.find(scene => pageId(scene) === op.pageId)
      if (source && !pages.some(scene => pageId(scene) === op.newId)) {
        const clone = {page: {...source.page, id: op.newId}, objects: copyObjects(source.objects, op.newId)}
        const index = pages.indexOf(source)
        pages = [...pages.slice(0, index + 1), clone, ...pages.slice(index + 1)]
      }
    } else if (op.type === 'removePage') {
      if (pages.length > 1) pages = pages.filter(scene => pageId(scene) !== op.pageId)
    } else if (op.type === 'pageOrder') {
      pages = orderSlots(pages.map(scene => ({...scene, id: pageId(scene)})), op.ids).map(({id, ...scene}) => scene)
    } else if (op.type === 'transferObjects') {
      const source = pages.find(scene => pageId(scene) === op.pageId), target = pages.find(scene => pageId(scene) === op.targetPageId)
      if (!source || !target || source === target) continue
      const ids = new Set(op.ids), selected = source.objects.filter(object => ids.has(object.id))
      const groups = new Set(selected.map(object => object.groupId).filter(Boolean))
      if (source.objects.some(object => groups.has(object.groupId) && !ids.has(object.id))) throw Error('Selecciona el grupo completo.')
      const objects = op.copy ? copyObjects(selected, op.copyId) : selected
      pages = pages.map(scene => scene === target ? {...scene, objects: [...scene.objects, ...objects]} : scene === source && !op.copy ? {...scene, objects: scene.objects.filter(object => !ids.has(object.id))} : scene)
    } else {
      const id = op.pageId ?? LEGACY_PAGE_ID
      pages = pages.map(scene => pageId(scene) === id ? editScene(scene, op) : scene)
    }
  }
  return withPages(document, pages)
}

export function diffOps(before, after) {
  const ops = [], nextPages = documentPages(after)
  const locations = new Map(documentPages(before).flatMap(scene => scene.objects.map(object => [object.id, pageId(scene)])))
  const transfers = new Map()
  for (const scene of nextPages) for (const object of scene.objects) {
    const source = locations.get(object.id), destination = pageId(scene)
    if (source && source !== destination) {
      const key = `${source}:${destination}`
      if (!transfers.has(key)) transfers.set(key,{type:'transferObjects',pageId:source,targetPageId:destination,ids:[],copy:false})
      transfers.get(key).ids.push(object.id)
    }
  }
  for (const transfer of transfers.values()) {
    if (!documentPages(before).some(scene => pageId(scene) === transfer.targetPageId)) {
      const target = nextPages.find(scene => pageId(scene) === transfer.targetPageId)
      const add = {type:'addPage',scene:{page:target.page,objects:[]}}
      ops.push(add);before=applyOps(before,[add])
    }
    ops.push(transfer);before=applyOps(before,[transfer])
  }
  const previousPages = documentPages(before)
  const scope = id => after.schemaVersion >= 7 ? {pageId: id} : {}
  for (const scene of nextPages) {
    const id = pageId(scene), beforeScene = previousPages.find(previous => pageId(previous) === id)
    if (!beforeScene) { ops.push({type: 'addPage', scene}); continue }
    const {page, objects} = scene, previous = new Map(beforeScene.objects.map(object => [object.id, object])), next = new Set(objects.map(object => object.id))
    if (!same(beforeScene.page, page)) ops.push({type: 'patchPage', ...scope(id), ...propertyDiff(beforeScene.page, page)})
    for (const object of beforeScene.objects) if (!next.has(object.id)) ops.push({type: 'remove', ...scope(id), id: object.id})
    for (const object of objects) if (!same(previous.get(object.id), object)) {
      const old = previous.get(object.id)
      ops.push(old && old.type === object.type ? {type: 'patch', ...scope(id), id: object.id, ...propertyDiff(old, object)} : {type: 'upsert', ...scope(id), object})
    }
    const simulated = ops.filter(op => op.pageId === id || !op.pageId && id === LEGACY_PAGE_ID)
    const ids = objects.map(object => object.id)
    const replayed = documentPages(applyOps(before, simulated)).find(scene => pageId(scene) === id)
    if (!same(replayed.objects.map(object => object.id), ids)) ops.push({type: 'order', ...scope(id), ids})
  }
  for (const scene of previousPages) if (!nextPages.some(next => pageId(next) === pageId(scene))) ops.push({type: 'removePage', pageId: pageId(scene)})
  const ids = nextPages.map(pageId)
  if (ops.some(op => op.type === 'addPage' || op.type === 'removePage') || !same(documentPages(applyOps(before, ops)).map(pageId), ids)) ops.push({type: 'pageOrder', ids})
  return ops
}

// Last op per object wins (re-adding moves it to the end, like the original
// sequence would); the last page and order ops are kept, order applied last.
export function compactOps(ops) {
  const result=[]
  for (const op of ops) {
    const previous=result.at(-1)
    if(previous && ['patch','patchPage'].includes(op.type) && previous.type===op.type && previous.id===op.id && previous.pageId===op.pageId){
      const set={...previous.set,...op.set},unset=new Set([...(previous.unset??[]),...(op.unset??[])])
      for(const key of Object.keys(op.set))unset.delete(key)
      for(const key of op.unset??[])delete set[key]
      result[result.length-1]={...op,set,unset:[...unset]}
    }else if(previous&&op.type==='upsert'&&previous.type==='upsert'&&previous.pageId===op.pageId&&op.object.id===previous.object.id)result[result.length-1]=op
    else result.push(op)
  }
  return result
}

const OBJECT_KEYS=new Set('x y width height rotation fill opacity groupId locked hidden text fontSize fontFamily fontVariant scaleX scaleY textAlign lineHeight charSpacing underline linethrough fileAssetId image points strokeWidth dash startArrow endArrow startCap endCap geometry svgName iconId fillPaint shape'.split(' '))
const PAGE_KEYS=new Set(['width','height','background','backgroundPaint','name'])
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(id)
function propertyDiff(before,after){
  return {set:Object.fromEntries(Object.entries(after).filter(([key,value])=>!same(before[key],value))),unset:Object.keys(before).filter(key=>!(key in after))}
}
function patchProperties(value,op){
  const next={...value,...op.set}
  for(const key of op.unset??[])delete next[key]
  return next
}
function validPatch(op,keys){
  return op.set && typeof op.set==='object' && !Array.isArray(op.set) && Object.keys(op.set).every(k=>keys.has(k))
    && (op.unset===undefined || Array.isArray(op.unset)&&op.unset.length<=keys.size&&op.unset.every(k=>keys.has(k)&&!(k in op.set)))
}

// Structural checks before any document validation (bounded, typed input).
export function checkOps(ops, limit = 500) {
  if (!Array.isArray(ops) || ops.length > limit) throw Error('Lote de cambios no válido.')
  for (const op of ops) {
    const uniqueIds = (ids, limit=500) => Array.isArray(ids) && ids.length <= limit && ids.every(validId) && new Set(ids).size === ids.length
    const pageOp = op && ((op.type === 'addPage' && op.scene?.page && validId(op.scene.page.id) && Array.isArray(op.scene.objects) && op.scene.objects.length <= 500 && (op.afterId === undefined || validId(op.afterId)))
      || (op.type === 'duplicatePage' && validId(op.pageId) && validId(op.newId) && op.newId.length <= 48)
      || (op.type === 'removePage' && validId(op.pageId))
      || (op.type === 'pageOrder' && uniqueIds(op.ids, 24))
      || (op.type === 'transferObjects' && validId(op.pageId) && validId(op.targetPageId) && uniqueIds(op.ids) && typeof op.copy === 'boolean' && (!op.copy || validId(op.copyId) && op.copyId.length <= 48)))
    const valid = op && (op.pageId === undefined || validId(op.pageId)) && (pageOp || (op.type === 'upsert' && op.object && validId(op.object.id)) || (op.type === 'remove' && validId(op.id))
      || (op.type==='patch'&&validId(op.id)&&validPatch(op,OBJECT_KEYS)) || (op.type==='patchPage'&&validPatch(op,PAGE_KEYS))
      || (op.type === 'order' && Array.isArray(op.ids) && op.ids.length <= 500 && op.ids.every(validId)&&new Set(op.ids).size===op.ids.length) || (op.type === 'page' && op.page && typeof op.page === 'object'&&!Array.isArray(op.page)))
    if (!valid) throw Error('Lote de cambios no válido.')
  }
  return ops
}
