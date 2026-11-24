// Record storage on a converted Builder module's EXISTING RME3 tables (F1B
// Stage 3). No copy, no second source of truth: ids, rows, attachments
// (file_asset by entity id), history and audit stay where they are. Columns
// come only from the declarative definition (validated identifiers) and every
// query is scoped to the token's company and to enabled rows.
const IDENT = /^[a-z][a-z0-9_]{0,62}$/
const q = (name) => { if (!IDENT.test(name)) throw new Error(`UNSAFE_IDENTIFIER:${name}`); return `"${name}"` }

export function createRme3TableStore({ pool, def, statementTimeoutMs = 2000 }) {
  const entities = new Map()
  for (const entity of def.entities) {
    if (!entity.table) throw new Error(`ENTITY_WITHOUT_TABLE:${entity.key}`)
    entities.set(entity.key, { table: q(entity.table), fields: entity.fields.map((f) => ({ key: f.key, col: q(f.key), type: f.type })) })
  }
  const meta = (entityKey) => { const m = entities.get(entityKey); if (!m) throw new Error('ENTITY_UNKNOWN'); return m }
  const select = (m) => ['"id"', ...m.fields.map((f) => (f.type === 'date' ? `to_char(${f.col}, 'YYYY-MM-DD') AS ${f.col}` : f.type === 'datetime' ? `to_char(${f.col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ${f.col}` : f.col)),
    `to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "__version"`, '"created_at"', '"updated_at"'].join(', ')
  const toRow = (m, r) => r && ({ id: r.id, data: Object.fromEntries(m.fields.map((f) => [f.key, f.type === 'number' && r[f.key] !== null ? Number(r[f.key]) : r[f.key] ?? null])), attachments: [], version: r.__version, createdAt: r.created_at, updatedAt: r.updated_at })
  const tx = async (fn) => {
    const client = await pool.connect()
    try { await client.query('BEGIN'); await client.query(`SET LOCAL statement_timeout = ${Math.trunc(statementTimeoutMs)}`); const out = await fn(client); await client.query('COMMIT'); return out } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e } finally { client.release() }
  }
  const writable = (m, data) => m.fields.filter((f) => Object.hasOwn(data, f.key))
  return {
    kind: 'rme3-table',
    async listRecords(ctx, entityKey, { state, stateField, limit }) {
      const m = meta(entityKey)
      const stateCol = stateField ? m.fields.find((f) => f.key === stateField)?.col : null
      const { rows } = await pool.query(`SELECT ${select(m)} FROM ${m.table} WHERE "company_id" = $1 AND "enabled" = true ${state && stateCol ? `AND ${stateCol} = $3` : ''} ORDER BY "created_at" DESC LIMIT $2`, state && stateCol ? [ctx.companyId, limit, state] : [ctx.companyId, limit])
      return rows.map((r) => toRow(m, r))
    },
    async getRecord(ctx, entityKey, id) {
      const m = meta(entityKey)
      return toRow(m, (await pool.query(`SELECT ${select(m)} FROM ${m.table} WHERE "id" = $1 AND "company_id" = $2 AND "enabled" = true`, [id, ctx.companyId])).rows[0])
    },
    async createRecord(ctx, entityKey, data) {
      const m = meta(entityKey), cols = writable(m, data)
      return tx(async (c) => toRow(m, (await c.query(`INSERT INTO ${m.table} ("company_id"${cols.map((f) => `, ${f.col}`).join('')}) VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')}) RETURNING ${select(m)}`, [ctx.companyId, ...cols.map((f) => data[f.key])])).rows[0]))
    },
    async updateRecord(ctx, entityKey, id, data, version) {
      const m = meta(entityKey), cols = writable(m, data)
      return tx(async (c) => {
        const { rows } = await c.query(`UPDATE ${m.table} SET ${[...cols.map((f, i) => `${f.col} = $${i + 4}`), '"updated_at" = now()'].join(', ')} WHERE "id" = $1 AND "company_id" = $2 AND "enabled" = true AND to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $3 RETURNING ${select(m)}`, [id, ctx.companyId, version, ...cols.map((f) => data[f.key])])
        if (!rows[0]) { const e = new Error('VERSION_CONFLICT'); e.code = 'VERSION_CONFLICT'; throw e }
        return toRow(m, rows[0])
      })
    },
  }
}
