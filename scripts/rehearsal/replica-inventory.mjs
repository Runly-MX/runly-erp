// Read-only inventory of a restored replica, and comparison of two inventories.
//   REPLICA_DATABASE_URL=... REPLICA_SUPABASE_URL=... REPLICA_SERVICE_ROLE_KEY=... \
//     node scripts/rehearsal/replica-inventory.mjs collect --output=before.json [--no-hash-objects] [--allow-host=<host>]
//   node scripts/rehearsal/replica-inventory.mjs compare before.json after.json [--allow=migrations-added,protections,buckets]
// Connection data comes from the environment only and is never printed. Refuses a database or Storage host that is not
// loopback or private unless it is named explicitly with --allow-host (so a production URL cannot be used by mistake).
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { collectInventory, diffInventories } from './lib/inventory.mjs'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const [command, first, second] = process.argv.slice(2)
const PRIVATE = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\]|host\.docker\.internal|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/
const hostOf = value => { try { return new URL(value).hostname } catch { return null } }

if (command === 'compare') {
  const [before, after] = await Promise.all([first, second].map(async file => JSON.parse(await readFile(file, 'utf8'))))
  const differences = diffInventories(before, after, { allow: (arg('allow') ?? '').split(',').filter(Boolean) })
  for (const difference of differences) console.log(`${difference.section}: ${difference.detail}`)
  console.log(differences.length ? `${differences.length} unexpected difference(s)` : 'No unexpected differences')
  process.exit(differences.length ? 1 : 0)
}
if (command !== 'collect' || !arg('output')) { console.error('usage: collect --output=<file> | compare <before> <after>'); process.exit(2) }
const { REPLICA_DATABASE_URL: databaseUrl, REPLICA_SUPABASE_URL: supabaseUrl, REPLICA_SERVICE_ROLE_KEY: serviceKey } = process.env
if (!databaseUrl || !supabaseUrl || !serviceKey) { console.error('REPLICA_DATABASE_URL, REPLICA_SUPABASE_URL and REPLICA_SERVICE_ROLE_KEY are required'); process.exit(2) }
const allowed = (arg('allow-host') ?? '').split(',').filter(Boolean)
for (const [label, value] of [['database', databaseUrl], ['storage', supabaseUrl]]) {
  const host = hostOf(value)
  if (!host || !(PRIVATE.test(host) || allowed.includes(host))) { console.error(`REFUSED: the ${label} host is not loopback or private. Name it with --allow-host only if it is the isolated replica.`); process.exit(3) }
}
const require = createRequire(resolve('apps/api/package.json'))
const pg = require('pg'), { createClient } = require('@supabase/supabase-js')
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
try {
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const inventory = await collectInventory({ pool, admin, hashObjects: !process.argv.includes('--no-hash-objects') })
  await writeFile(resolve(arg('output')), JSON.stringify(inventory, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ tables: Object.keys(inventory.tables).length, migrations: inventory.migrations.length, buckets: inventory.storage.buckets.length, objects: Object.keys(inventory.storage.objects).length, externalReachTables: inventory.externalReach.tables.length }))
} catch { console.error('Inventory failed; no connection data is logged. Check the replica configuration.'); process.exitCode = 1 } finally { await pool.end() }
