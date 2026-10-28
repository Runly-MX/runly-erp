// Read-only inventory of a Runly database + Storage, used before and after an update rehearsal.
// It never prints or stores connection strings or keys: callers pass an open pg Pool and a Supabase admin client.
import { createHash } from 'node:crypto'

const NOTES_BUCKETS = ['runly-notes', 'atlas-notes']
// Tables that can carry data able to reach outside the replica (mail, push, OAuth, webhooks, connections).
const EXTERNAL_REACH = /smtp|push|fcm|device|token|oauth|webhook|integration|credential|secret|mail|email|subscription|provider|delivery|connection|calendar/i
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const quote = identifier => `"${String(identifier).replaceAll('"', '""')}"`

export async function collectInventory({ pool, admin = null, hashTables = true, hashObjects = true, maxHashedRows = 100000 }) {
  const rows = async (sql, params = []) => (await pool.query(sql, params)).rows
  const one = async (sql, fallback = null) => { try { return (await rows(sql))[0] ?? fallback } catch { return fallback } }
  const inventory = {
    schema: 1,
    server: (await one('SHOW server_version'))?.server_version ?? null,
    migrations: null, modules: null, tables: {}, semantic: {}, storage: { buckets: [], objects: {} }, protections: {}, externalReach: { tables: [], instanceConfigKeys: [] },
  }
  inventory.migrations = (await one("SELECT to_regclass('public._prisma_migrations') AS t"))?.t
    ? (await rows('SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY migration_name'))
    : []
  inventory.modules = await one("SELECT to_regclass('public.runly_module') AS t").then(async r => r?.t ? await rows("SELECT key, status, enabled, version FROM runly_module ORDER BY key").catch(() => null) : null)
  for (const { table_name: name } of await rows("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")) {
    const count = Number((await one(`SELECT count(*) AS n FROM public.${quote(name)}`))?.n ?? -1)
    const entry = { rows: count }
    if (hashTables && count > 0 && count <= maxHashedRows) {
      // Whole-row text hash, order independent: detects any changed value without exporting it.
      entry.digest = (await one(`SELECT md5(string_agg(t::text, E'\\n' ORDER BY t::text)) AS d FROM public.${quote(name)} t`))?.d ?? null
    }
    inventory.tables[name] = entry
    if (EXTERNAL_REACH.test(name) && count > 0) inventory.externalReach.tables.push({ name, rows: count })
  }
  if (inventory.tables.instance_config) {
    inventory.externalReach.instanceConfigKeys = (await rows('SELECT key FROM instance_config ORDER BY key').catch(() => [])).map(r => r.key).filter(key => EXTERNAL_REACH.test(key))
  }
  // Meaning, not timestamps: who has which permission and who belongs to which company with which role.
  // These must be identical after an update even when row digests change because of updated_at.
  inventory.semantic = {
    grants: (await one("SELECT md5(string_agg(role_id::text || ':' || permission_id::text, ',' ORDER BY role_id::text, permission_id::text)) AS d FROM role_permission"))?.d ?? null,
    memberships: (await one("SELECT md5(string_agg(company_id::text || ':' || user_id::text || ':' || role_id::text, ',' ORDER BY company_id::text, user_id::text)) AS d FROM membership"))?.d ?? null,
    identities: (await one("SELECT md5(string_agg(id::text || ':' || coalesce(email,''), ',' ORDER BY id::text)) AS d FROM user_profile"))?.d ?? null,
  }
  inventory.storage.buckets = await rows("SELECT id, public, file_size_limit FROM storage.buckets ORDER BY id").catch(() => [])
  const objects = await rows("SELECT bucket_id, name, (metadata->>'size')::bigint AS size, metadata->>'mimetype' AS mimetype FROM storage.objects ORDER BY bucket_id, name").catch(() => [])
  for (const object of objects) {
    const key = `${object.bucket_id}/${object.name}`
    const entry = { size: object.size === null ? null : Number(object.size), mimetype: object.mimetype }
    if (hashObjects && admin) {
      const downloaded = await admin.storage.from(object.bucket_id).download(object.name)
      entry.sha256 = downloaded.error ? `UNREADABLE:${downloaded.error.status ?? downloaded.error.name ?? 'error'}` : sha256(Buffer.from(await downloaded.data.arrayBuffer()))
    }
    inventory.storage.objects[key] = entry
  }
  const count = async sql => Number((await one(sql))?.n ?? -1)
  inventory.protections = {
    notesPolicy: await count("SELECT count(*)::int AS n FROM pg_policy WHERE polname='runly_notes_private_images_v1'"),
    notesGuard: await count("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='runly_notes_bucket_private_v1' AND NOT tgisinternal"),
    notesBucketsPrivate: inventory.storage.buckets.filter(bucket => NOTES_BUCKETS.includes(bucket.id)).every(bucket => bucket.public === false),
  }
  return inventory
}

// Compares two inventories. `allow` lists sections that are EXPECTED to change in an update
// ('migrations' additions, 'protections', 'buckets', 'tables:<name>'); everything else must be identical.
export function diffInventories(before, after, { allow = [] } = {}) {
  const differences = []
  const note = (section, detail) => { if (!allow.includes(section)) differences.push({ section, detail }) }
  if (before.server !== after.server) note('server', `${before.server} -> ${after.server}`)
  const beforeMigrations = new Map(before.migrations.map(m => [m.name, `${m.finished}/${m.rolled_back}`]))
  const afterMigrations = new Map(after.migrations.map(m => [m.name, `${m.finished}/${m.rolled_back}`]))
  for (const [name, state] of beforeMigrations) if (afterMigrations.get(name) !== state) note('migrations', `${name} changed or disappeared`)
  const added = after.migrations.filter(m => !beforeMigrations.has(m.name)).map(m => m.name)
  if (added.length) note('migrations-added', added.join(','))
  for (const name of new Set([...Object.keys(before.tables), ...Object.keys(after.tables)])) {
    const a = before.tables[name], b = after.tables[name]
    if (!a || !b) note(`tables:${name}`, a ? 'table removed' : 'table added')
    else if (a.rows !== b.rows || a.digest !== b.digest) note(`tables:${name}`, `${a.rows} rows/${a.digest ?? '-'} -> ${b.rows} rows/${b.digest ?? '-'}`)
  }
  for (const key of new Set([...Object.keys(before.storage.objects), ...Object.keys(after.storage.objects)])) {
    const a = before.storage.objects[key], b = after.storage.objects[key]
    if (!a || !b) note('objects', `${key}: ${a ? 'removed' : 'added'}`)
    else if (a.sha256 !== b.sha256 || a.size !== b.size) note('objects', `${key}: content or size changed`)
  }
  for (const key of new Set([...Object.keys(before.semantic ?? {}), ...Object.keys(after.semantic ?? {})])) if (before.semantic?.[key] !== after.semantic?.[key]) note(`semantic:${key}`, 'permissions, memberships or identities changed')
  if (JSON.stringify(before.storage.buckets) !== JSON.stringify(after.storage.buckets)) note('buckets', JSON.stringify({ before: before.storage.buckets, after: after.storage.buckets }))
  if (JSON.stringify(before.protections) !== JSON.stringify(after.protections)) note('protections', JSON.stringify({ before: before.protections, after: after.protections }))
  if (JSON.stringify(before.modules) !== JSON.stringify(after.modules)) note('modules', 'installed module list changed')
  return differences
}
