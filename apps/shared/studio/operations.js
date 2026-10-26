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

export function applyOps(document, ops) {
  let page = document.page, objects = [...document.objects]
  for (const op of ops) {
    if (op.type === 'page') page = { ...op.page }
    else if (op.type === 'patchPage') page = patchProperties(page, op)
    else if (op.type === 'patch') objects = objects.map(object => object.id === op.id ? patchProperties(object, op) : object)
    else if (op.type === 'remove') objects = objects.filter(object => object.id !== op.id)
    else if (op.type === 'upsert') {
      const index = objects.findIndex(object => object.id === op.object.id)
      if (index >= 0) objects[index] = op.object
      else objects.push(op.object)
    } else if (op.type === 'order') objects = orderSlots(objects, op.ids)
    else throw Error('Operación de diseño no admitida.')
  }
  return { ...document, page, objects }
}

export function diffOps(before, after) {
  const ops = [], previous = new Map(before.objects.map(object => [object.id, object])), next = new Set(after.objects.map(object => object.id))
  if (!same(before.page, after.page)) ops.push({ type: 'patchPage', ...propertyDiff(before.page, after.page) })
  for (const object of before.objects) if (!next.has(object.id)) ops.push({ type: 'remove', id: object.id })
  for (const object of after.objects) if (!same(previous.get(object.id), object)) {
    const old=previous.get(object.id)
    ops.push(old && old.type===object.type ? {type:'patch',id:object.id,...propertyDiff(old,object)} : { type: 'upsert', object })
  }
  // Order only when applying the above would not already reproduce it.
  const ids = after.objects.map(object => object.id)
  if (!same(applyOps(before, ops).objects.map(object => object.id), ids)) ops.push({ type: 'order', ids })
  return ops
}

// Last op per object wins (re-adding moves it to the end, like the original
// sequence would); the last page and order ops are kept, order applied last.
export function compactOps(ops) {
  const result=[]
  for (const op of ops) {
    const previous=result.at(-1)
    if(previous && ['patch','patchPage'].includes(op.type) && previous.type===op.type && previous.id===op.id){
      const set={...previous.set,...op.set},unset=new Set([...(previous.unset??[]),...(op.unset??[])])
      for(const key of Object.keys(op.set))unset.delete(key)
      for(const key of op.unset??[])delete set[key]
      result[result.length-1]={...op,set,unset:[...unset]}
    }else if(previous&&op.type==='upsert'&&previous.type==='upsert'&&op.object.id===previous.object.id)result[result.length-1]=op
    else result.push(op)
  }
  return result
}

const OBJECT_KEYS=new Set('x y width height rotation fill opacity groupId locked hidden text fontSize fontFamily fontVariant scaleX scaleY textAlign lineHeight charSpacing underline linethrough fileAssetId image points strokeWidth dash startArrow endArrow startCap endCap geometry svgName iconId fillPaint shape'.split(' '))
const PAGE_KEYS=new Set(['width','height','background','backgroundPaint'])
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
    const valid = op && ((op.type === 'upsert' && op.object && validId(op.object.id)) || (op.type === 'remove' && validId(op.id))
      || (op.type==='patch'&&validId(op.id)&&validPatch(op,OBJECT_KEYS)) || (op.type==='patchPage'&&validPatch(op,PAGE_KEYS))
      || (op.type === 'order' && Array.isArray(op.ids) && op.ids.length <= 500 && op.ids.every(validId)&&new Set(op.ids).size===op.ids.length) || (op.type === 'page' && op.page && typeof op.page === 'object'&&!Array.isArray(op.page)))
    if (!valid) throw Error('Lote de cambios no válido.')
  }
  return ops
}
