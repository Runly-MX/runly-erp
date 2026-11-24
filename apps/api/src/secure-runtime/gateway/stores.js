// Gateway storage. Every query is filtered by the company and module taken
// from the host-signed call token (ctx), never from module arguments.
import { randomUUID } from 'node:crypto'

const ns = (ctx) => `${ctx.companyId}:${ctx.moduleKey}`

export function createMemoryStore({ contacts = [], members = [] } = {}) {
  const records = new Map(), events = [], notifications = [], audits = [], idem = new Map()
  const stamp = () => new Date().toISOString()
  return {
    records, events, notifications, audits,
    async listRecords(ctx, entity, { state, stateField, limit }) {
      return [...records.values()].filter((r) => r.ns === ns(ctx) && r.entity === entity && (!state || r.data[stateField] === state)).slice(0, limit)
    },
    async getRecord(ctx, entity, id) { const r = records.get(id); return r && r.ns === ns(ctx) && r.entity === entity ? r : null },
    async createRecord(ctx, entity, data) {
      const row = { id: randomUUID(), ns: ns(ctx), entity, data, attachments: [], version: 1, createdBy: ctx.profileId, createdAt: stamp(), updatedAt: stamp() }
      records.set(row.id, row); return row
    },
    async updateRecord(ctx, entity, id, data, version, attachments) {
      const row = await this.getRecord(ctx, entity, id)
      if (!row || row.version !== version) { const e = new Error('VERSION_CONFLICT'); e.code = 'VERSION_CONFLICT'; throw e }
      Object.assign(row, { data, version: version + 1, updatedAt: stamp(), ...(attachments ? { attachments } : {}) }); return row
    },
    async resolveRelation(ctx, target, ids) {
      if (target !== 'runly.contacts:contact') return []
      return contacts.filter((c) => c.companyId === ctx.companyId && ids.includes(c.id)).map((c) => ({ id: c.id, label: c.name }))
    },
    async companyMembers(ctx, ids) { return members.filter((m) => m.companyId === ctx.companyId && ids.includes(m.userId)).map((m) => m.userId) },
    async insertNotifications(ctx, to, title, body) { for (const userId of to) notifications.push({ companyId: ctx.companyId, userId, title, body }) },
    async insertEvent(ctx, event, payload) { events.push({ companyId: ctx.companyId, moduleKey: ctx.moduleKey, event, payload }) },
    async getIdempotent(claims, key) { return idem.get(`${claims.mod}:${claims.cid}:${key}`) ?? null },
    async putIdempotent(claims, key, response) { idem.set(`${claims.mod}:${claims.cid}:${key}`, response) },
    async audit(claims, action, details) { audits.push({ companyId: claims.cid, actorId: claims.uid, moduleKey: claims.mod, action, details }) },
  }
}

// PostgreSQL store. The schema is provisioned lazily (like Runly ORM tables)
// and only when the experimental runtime is enabled; PostgREST roles get no
// access to it.
export function createPgStore({ pool, statementTimeoutMs = 2000 }) {
  const S = 'runly_secure_runtime'
  let ready = null
  const tx = async (fn) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL statement_timeout = ${Math.trunc(statementTimeoutMs)}`)
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error } finally { client.release() }
  }
  const map = (r) => r && ({ id: r.id, data: r.data, attachments: r.attachments, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at })
  async function ensure() {
    ready ??= pool.query(`
      CREATE SCHEMA IF NOT EXISTS ${S};
      CREATE TABLE IF NOT EXISTS ${S}.record (
        id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, module_key text NOT NULL, entity text NOT NULL,
        data jsonb NOT NULL, attachments jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1, created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS record_scope_idx ON ${S}.record (company_id, module_key, entity, created_at DESC);
      CREATE TABLE IF NOT EXISTS ${S}.event (id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, module_key text NOT NULL, event text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS ${S}.idempotency (module_key text NOT NULL, company_id uuid NOT NULL, key text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (module_key, company_id, key));
      REVOKE ALL ON SCHEMA ${S} FROM PUBLIC;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON SCHEMA ${S} FROM anon, authenticated; END IF; END $$;`)
    return ready
  }
  return {
    ensure,
    async listRecords(ctx, entity, { state, stateField, limit }) {
      await ensure()
      const { rows } = await pool.query(`SELECT * FROM ${S}.record WHERE company_id=$1 AND module_key=$2 AND entity=$3 AND ($4::text IS NULL OR data->>$5 = $4) ORDER BY created_at DESC LIMIT $6`, [ctx.companyId, ctx.moduleKey, entity, state ?? null, stateField ?? '', limit])
      return rows.map(map)
    },
    async getRecord(ctx, entity, id) {
      await ensure()
      return map((await pool.query(`SELECT * FROM ${S}.record WHERE id=$1 AND company_id=$2 AND module_key=$3 AND entity=$4`, [id, ctx.companyId, ctx.moduleKey, entity])).rows[0])
    },
    async createRecord(ctx, entity, data) {
      await ensure()
      return tx(async (c) => map((await c.query(`INSERT INTO ${S}.record(company_id,module_key,entity,data,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [ctx.companyId, ctx.moduleKey, entity, data, ctx.profileId])).rows[0]))
    },
    async updateRecord(ctx, entity, id, data, version, attachments) {
      await ensure()
      return tx(async (c) => {
        const { rows } = await c.query(`UPDATE ${S}.record SET data=$5, attachments=COALESCE($7::jsonb, attachments), version=version+1, updated_at=now() WHERE id=$1 AND company_id=$2 AND module_key=$3 AND entity=$4 AND version=$6 RETURNING *`, [id, ctx.companyId, ctx.moduleKey, entity, data, version, attachments ? JSON.stringify(attachments) : null])
        if (!rows[0]) { const e = new Error('VERSION_CONFLICT'); e.code = 'VERSION_CONFLICT'; throw e }
        return map(rows[0])
      })
    },
    async resolveRelation(ctx, target, ids) {
      if (target !== 'runly.contacts:contact') return []
      const { rows } = await pool.query(`SELECT id, name FROM public.contact WHERE company_id=$1 AND id = ANY($2::uuid[]) AND enabled`, [ctx.companyId, ids])
      return rows.map((r) => ({ id: r.id, label: r.name }))
    },
    async companyMembers(ctx, ids) {
      const { rows } = await pool.query(`SELECT user_id FROM public.membership WHERE company_id=$1 AND enabled AND user_id = ANY($2::uuid[])`, [ctx.companyId, ids])
      return rows.map((r) => r.user_id)
    },
    async insertNotifications(ctx, to, title, body) {
      await tx(async (c) => { for (const userId of to) await c.query(`INSERT INTO public.notification(id,user_id,company_id,kind,event_type,source_type,title,body,updated_at) VALUES (uuidv7(),$1,$2,'info','runtime.module',$3,$4,$5,now())`, [userId, ctx.companyId, ctx.moduleKey, title, body]) })
    },
    async insertEvent(ctx, event, payload) { await ensure(); await pool.query(`INSERT INTO ${S}.event(company_id,module_key,event,payload) VALUES ($1,$2,$3,$4)`, [ctx.companyId, ctx.moduleKey, event, payload]) },
    async getIdempotent(claims, key) { await ensure(); return (await pool.query(`SELECT response FROM ${S}.idempotency WHERE module_key=$1 AND company_id=$2 AND key=$3`, [claims.mod, claims.cid, key])).rows[0]?.response ?? null },
    async putIdempotent(claims, key, response) { await ensure(); await pool.query(`INSERT INTO ${S}.idempotency(module_key,company_id,key,response) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [claims.mod, claims.cid, key, response]) },
    async audit(claims, action, details) {
      await pool.query(`INSERT INTO public.audit_log(id,company_id,actor_id,module_key,entity_type,action,after,created_at) VALUES (uuidv7(),$1,$2,$3,'RunlyModuleCapability',$4,$5,now())`, [claims.cid, claims.uid, claims.mod, action, JSON.stringify(details ?? {})])
    },
  }
}
