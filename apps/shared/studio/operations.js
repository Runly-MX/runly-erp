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
  if (!same(before.page, after.page)) ops.push({ type: 'page', page: after.page })
  for (const object of before.objects) if (!next.has(object.id)) ops.push({ type: 'remove', id: object.id })
  for (const object of after.objects) if (!same(previous.get(object.id), object)) ops.push({ type: 'upsert', object })
  // Order only when applying the above would not already reproduce it.
  const ids = after.objects.map(object => object.id)
  if (!same(applyOps(before, ops).objects.map(object => object.id), ids)) ops.push({ type: 'order', ids })
  return ops
}

// Last op per object wins (re-adding moves it to the end, like the original
// sequence would); the last page and order ops are kept, order applied last.
export function compactOps(ops) {
  const byId = new Map()
  let page = null, order = null
  for (const op of ops) {
    if (op.type === 'page') page = op
    else if (op.type === 'order') order = op
    else { const id = op.type === 'remove' ? op.id : op.object.id; byId.delete(id); byId.set(id, op) }
  }
  return [...(page ? [page] : []), ...byId.values(), ...(order ? [order] : [])]
}

// Structural checks before any document validation (bounded, typed input).
export function checkOps(ops, limit = 500) {
  if (!Array.isArray(ops) || ops.length > limit) throw Error('Lote de cambios no válido.')
  for (const op of ops) {
    const valid = op && ((op.type === 'upsert' && op.object && typeof op.object.id === 'string') || (op.type === 'remove' && typeof op.id === 'string')
      || (op.type === 'order' && Array.isArray(op.ids) && op.ids.length <= 500 && op.ids.every(id => typeof id === 'string')) || (op.type === 'page' && op.page && typeof op.page === 'object'))
    if (!valid) throw Error('Lote de cambios no válido.')
  }
  return ops
}
