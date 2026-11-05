// Accent-insensitive `contains` for every Prisma read.
//
// Prisma's `{ contains, mode: 'insensitive' }` ignores case but not accents, so
// "telefono" never finds "Teléfono". This client extension rewrites each such
// filter on a String column (also inside AND/OR/NOT and relation filters) into
// `{ id: { in: <ids> } }`, the ids coming from one raw query over
// atlas_unaccent(lower(column)) (migration 20260902000000_chat_message_search).
// When the query is tenant-scoped (top-level `companyId` string) the id lookup
// is scoped to that company too. Case-sensitive filters and other operators are
// left untouched.
import { Prisma } from '@prisma/client'
import { escapeLike, normalizeSearchText } from './search-tokens.js'

// shortcut: a term matching more than MATCH_CAP rows of one model keeps only MATCH_CAP of them; upgrade to a SQL-side join if a search ever needs more.
export const MATCH_CAP = 5000
const READ_OPERATIONS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy'])
const LIKE_ESCAPE_SQL = Prisma.raw("'" + String.fromCharCode(92) + "'")
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`

export function buildModelIndex(datamodel = Prisma.dmmf.datamodel) {
  const index = new Map()
  for (const model of datamodel.models) {
    const fields = new Map(model.fields.map((f) => [f.name, f]))
    // Prisma 7's runtime DMMF has no isId flag; every searchable model uses an `id` primary key.
    const id = model.fields.find((f) => f.isId) ?? fields.get('id')
    const company = fields.get('companyId')
    index.set(model.name, {
      name: model.name,
      table: model.dbName ?? model.name,
      idField: id?.name ?? null,
      idColumn: id ? (id.dbName ?? id.name) : null,
      companyColumn: company?.kind === 'scalar' ? (company.dbName ?? company.name) : null,
      fields,
    })
  }
  return index
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
const isAccentFilter = (field, value) => field?.kind === 'scalar' && field.type === 'String' && isPlainObject(value)
  && value.mode === 'insensitive' && typeof value.contains === 'string' && value.contains.trim() !== ''

// Returns a copy of `where` with every accent filter replaced, or `where` itself when none.
// findIds(model, column, term, companyId) -> Promise<string[]>.
export async function rewriteWhere(index, modelName, where, findIds, companyId = null) {
  const model = index.get(modelName)
  if (!model || !isPlainObject(where)) return where
  const scopedCompany = typeof where.companyId === 'string' ? where.companyId : companyId
  let changed = false
  const out = {}
  const extra = []
  for (const [key, value] of Object.entries(where)) {
    if ((key === 'AND' || key === 'OR' || key === 'NOT') && value != null) {
      const list = Array.isArray(value) ? value : [value]
      const next = await Promise.all(list.map((w) => rewriteWhere(index, modelName, w, findIds, scopedCompany)))
      if (next.some((w, i) => w !== list[i])) changed = true
      out[key] = Array.isArray(value) ? next : next[0]
      continue
    }
    const field = model.fields.get(key)
    if (model.idField && isAccentFilter(field, value)) {
      const { contains, mode, ...rest } = value
      const ids = await findIds(model, field.dbName ?? field.name, contains, scopedCompany)
      extra.push({ [model.idField]: { in: ids } })
      if (Object.keys(rest).length) out[key] = rest
      changed = true
      continue
    }
    if (field?.kind === 'object' && isPlainObject(value)) {
      const target = field.type
      const next = {}
      let relChanged = false
      for (const [op, inner] of Object.entries(value)) {
        if (['is', 'isNot', 'some', 'every', 'none'].includes(op)) {
          next[op] = await rewriteWhere(index, target, inner, findIds, scopedCompany)
          if (next[op] !== inner) relChanged = true
        } else {
          next[op] = inner
        }
      }
      // A to-one relation can also be filtered directly ({ category: { name: {...} } }).
      const direct = !Object.keys(value).some((op) => ['is', 'isNot', 'some', 'every', 'none'].includes(op))
      if (direct && !field.isList) {
        const rewritten = await rewriteWhere(index, target, value, findIds, scopedCompany)
        out[key] = rewritten
        if (rewritten !== value) changed = true
        continue
      }
      out[key] = relChanged ? next : value
      if (relChanged) changed = true
      continue
    }
    out[key] = value
  }
  if (!changed) return where
  if (extra.length) out.AND = [...(Array.isArray(out.AND) ? out.AND : out.AND ? [out.AND] : []), ...extra]
  return out
}

export function createIdFinder(baseClient) {
  return async function findIds(model, column, term, companyId) {
    const pattern = `%${escapeLike(normalizeSearchText(term.trim()))}%`
    const col = Prisma.raw(`${quoteIdent(model.table)}.${quoteIdent(column)}`)
    const scope = companyId && model.companyColumn
      ? Prisma.sql`AND ${Prisma.raw(`${quoteIdent(model.table)}.${quoteIdent(model.companyColumn)}`)}::text = ${companyId}`
      : Prisma.empty
    const rows = await baseClient.$queryRaw`
      SELECT ${Prisma.raw(`${quoteIdent(model.table)}.${quoteIdent(model.idColumn)}`)}::text AS id
      FROM ${Prisma.raw(quoteIdent(model.table))}
      WHERE atlas_unaccent(lower(coalesce(${col}, ''))) LIKE ${pattern} ESCAPE ${LIKE_ESCAPE_SQL} ${scope}
      LIMIT ${MATCH_CAP}`
    return rows.map((r) => r.id)
  }
}

// prisma = withAccentInsensitiveSearch(new PrismaClient(...))
export function withAccentInsensitiveSearch(client) {
  const index = buildModelIndex()
  const findIds = createIdFinder(client)
  return client.$extends({
    name: 'accent-insensitive-search',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!READ_OPERATIONS.has(operation) || !args?.where) return query(args)
          const where = await rewriteWhere(index, model, args.where, findIds)
          return query(where === args.where ? args : { ...args, where })
        },
      },
    },
  })
}
