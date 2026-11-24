// Declarative expressions: a JSON tree interpreted by an allowlist of
// operations. No eval, no Function, no property access beyond declared record
// fields, bounded size, depth and evaluation steps.
//   { "op": "and", "args": [ { "op": "gt", "args": [ { "field": "monto" }, { "value": 0 } ] }, ... ] }
export const EXPRESSION_LIMITS = Object.freeze({ maxNodes: 64, maxDepth: 8, maxString: 500, maxSteps: 256 })

const OPS = {
  and: { min: 1, max: 8 }, or: { min: 1, max: 8 }, not: { min: 1, max: 1 },
  eq: { min: 2, max: 2 }, ne: { min: 2, max: 2 }, gt: { min: 2, max: 2 }, gte: { min: 2, max: 2 }, lt: { min: 2, max: 2 }, lte: { min: 2, max: 2 },
  in: { min: 2, max: 2 }, empty: { min: 1, max: 1 }, len: { min: 1, max: 1 },
  add: { min: 2, max: 4 }, sub: { min: 2, max: 2 }, mul: { min: 2, max: 2 }, concat: { min: 2, max: 4 },
}

export class ExpressionError extends Error {
  constructor(message) { super(message); this.name = 'ExpressionError'; this.code = 'EXPRESSION_INVALID' }
}

// Static check at definition load: shape, ops, limits, and field references.
export function checkExpression(node, { fields }) {
  let count = 0
  const walk = (n, depth) => {
    if (++count > EXPRESSION_LIMITS.maxNodes) throw new ExpressionError('Expresión demasiado grande.')
    if (depth > EXPRESSION_LIMITS.maxDepth) throw new ExpressionError('Expresión demasiado profunda.')
    if (!n || typeof n !== 'object' || Array.isArray(n)) throw new ExpressionError('Nodo de expresión inválido.')
    const keys = Object.keys(n)
    if (keys.length === 1 && keys[0] === 'field') {
      if (!fields.has(n.field)) throw new ExpressionError(`Campo desconocido en expresión: ${String(n.field).slice(0, 40)}`)
      return
    }
    if (keys.length === 1 && keys[0] === 'value') {
      const v = n.value
      const ok = v === null || ['number', 'boolean'].includes(typeof v) || (typeof v === 'string' && v.length <= EXPRESSION_LIMITS.maxString)
        || (Array.isArray(v) && v.length <= 32 && v.every((x) => ['string', 'number', 'boolean'].includes(typeof x) && String(x).length <= EXPRESSION_LIMITS.maxString))
      if (!ok || (typeof v === 'number' && !Number.isFinite(v))) throw new ExpressionError('Valor literal no permitido.')
      return
    }
    if (keys.sort().join(',') !== 'args,op' || !Object.hasOwn(OPS, n.op) || !Array.isArray(n.args)) throw new ExpressionError('Operación no permitida.')
    const { min, max } = OPS[n.op]
    if (n.args.length < min || n.args.length > max) throw new ExpressionError(`Número de argumentos inválido para ${n.op}.`)
    for (const arg of n.args) walk(arg, depth + 1)
  }
  walk(node, 0)
  return true
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const cmp = (a, b, fn) => (typeof a === typeof b && (typeof a === 'number' || typeof a === 'string') ? fn(a, b) : false)

export function evaluateExpression(node, record) {
  let steps = 0
  const ev = (n) => {
    if (++steps > EXPRESSION_LIMITS.maxSteps) throw new ExpressionError('Evaluación excedió el límite.')
    if (Object.hasOwn(n, 'field')) return Object.hasOwn(record, n.field) ? record[n.field] ?? null : null
    if (Object.hasOwn(n, 'value')) return n.value
    const a = n.args
    switch (n.op) {
      case 'and': return a.every((x) => ev(x) === true)
      case 'or': return a.some((x) => ev(x) === true)
      case 'not': return ev(a[0]) !== true
      case 'eq': return ev(a[0]) === ev(a[1])
      case 'ne': return ev(a[0]) !== ev(a[1])
      case 'gt': return cmp(ev(a[0]), ev(a[1]), (x, y) => x > y)
      case 'gte': return cmp(ev(a[0]), ev(a[1]), (x, y) => x >= y)
      case 'lt': return cmp(ev(a[0]), ev(a[1]), (x, y) => x < y)
      case 'lte': return cmp(ev(a[0]), ev(a[1]), (x, y) => x <= y)
      case 'in': { const list = ev(a[1]); return Array.isArray(list) && list.includes(ev(a[0])) }
      case 'empty': { const v = ev(a[0]); return v === null || v === '' || (Array.isArray(v) && v.length === 0) }
      case 'len': { const v = ev(a[0]); return typeof v === 'string' || Array.isArray(v) ? v.length : 0 }
      case 'add': { const vs = a.map(ev).map(num); return vs.includes(null) ? null : vs.reduce((x, y) => x + y, 0) }
      case 'sub': { const [x, y] = a.map(ev).map(num); return x === null || y === null ? null : x - y }
      case 'mul': { const [x, y] = a.map(ev).map(num); return x === null || y === null ? null : x * y }
      case 'concat': return a.map(ev).map((v) => (v === null ? '' : String(v))).join('').slice(0, EXPRESSION_LIMITS.maxString)
      default: throw new ExpressionError('Operación no permitida.')
    }
  }
  return ev(node)
}
