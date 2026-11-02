#!/usr/bin/env node
// READ-ONLY preflight of the database that the E2E instance shares. It opens a
// read-only transaction, never writes, and prints no connection data, hosts or
// credentials. Run it before updating the instance and again after.
//
//   RUNLY_E2E_PREFLIGHT_DATABASE_URL=...  node scripts/e2e-commerce/preflight-shared-db.mjs
//   node scripts/e2e-commerce/preflight-shared-db.mjs --env-file .env      (reads DIRECT_URL, never printed)
//
// Exit code 0 only when: no migration is in a failed state, exactly one
// company looks like the E2E company, and no OPEN cash container is duplicated.
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'

const argv = process.argv.slice(2)
const envFile = argv.includes('--env-file') ? argv[argv.indexOf('--env-file') + 1] : null
let url = process.env.RUNLY_E2E_PREFLIGHT_DATABASE_URL
if (!url && envFile) {
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DIRECT_URL=')) ?? readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  url = line?.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '')
}
if (!url) { console.error('Define RUNLY_E2E_PREFLIGHT_DATABASE_URL o usa --env-file <archivo con DIRECT_URL>.'); process.exit(2) }
const pattern = argv.includes('--pattern') ? argv[argv.indexOf('--pattern') + 1] : 'e2e'

const client = new pg.Client({ connectionString: url, options: '-c default_transaction_read_only=on', connectionTimeoutMillis: 15000 })
try { await client.connect() } catch (error) { console.error(`No se pudo conectar (${error.code ?? 'error'}). ¿Tu IP está permitida?`); process.exit(2) }
await client.query('BEGIN READ ONLY')
const q = async (sql, params) => (await client.query(sql, params)).rows
const out = { readOnly: (await q('show transaction_read_only'))[0].transaction_read_only, server: (await q('select version()'))[0].version.split(' ').slice(0, 2).join(' ') }

const rows = await q('select migration_name n, finished_at is not null f, rolled_back_at is not null rb from _prisma_migrations')
const finished = new Set(rows.filter((r) => r.f && !r.rb).map((r) => r.n))
const repo = readdirSync('prisma/migrations').filter((d) => /^\d{14}_/.test(d)).sort()
out.migrations = {
  appliedFinished: finished.size, inRepo: repo.length,
  pending: repo.filter((n) => !finished.has(n)),
  failedUnresolved: rows.filter((r) => !r.f && !r.rb).map((r) => r.n),
  rolledBackAndNotReapplied: rows.filter((r) => r.rb && !finished.has(r.n)).map((r) => r.n),
  unknownToRepo: [...finished].filter((n) => !repo.includes(n)),
}
out.candidates = (await q(`select c.id::text id, c.name, c.slug,
  (select count(*) from pos_outlet o where o.company_id=c.id)::int outlets, (select count(*) from catalog_product p where p.company_id=c.id)::int products,
  (select count(*) from pos_order o where o.company_id=c.id)::int orders, (select count(*) from membership m where m.company_id=c.id)::int members
  from company c where lower(c.name) like $1 or lower(c.slug) like $1 order by c.created_at`, [`%${pattern}%`]))
out.companies = (await q('select count(*)::int n from company'))[0].n
out.modules = await q(`select key, status::text, enabled from runly_module where key in ('runly.catalog','runly.pos') order by key`)
out.duplicates = (await q(`select (select count(*) from (select 1 from pos_session where status='OPEN' group by company_id,terminal_id having count(*)>1) x)::int sessions,
  (select count(*) from (select 1 from pos_waiter_shift where status='OPEN' group by company_id,outlet_id,waiter_id having count(*)>1) y)::int shifts`))[0]
out.commerceObjects = (await q(`select to_regclass('public.pos_refund') is not null refund, to_regclass('public.catalog_stock_balance') is not null stockBalance,
  to_regclass('public.pos_print_job') is not null printJob, to_regclass('public.pos_kitchen_dispatch') is not null dispatch,
  exists(select 1 from information_schema.columns where table_name='catalog_product' and column_name='revision') productRevision`))[0]
out.stockLedgerGuard = (await q(`select exists(select 1 from pg_trigger where tgname='commerce_product_stock_guard' and not tgisinternal) active`))[0].active
await client.query('ROLLBACK'); await client.end()

console.log(JSON.stringify(out, null, 2))
const problems = []
if (out.migrations.failedUnresolved.length) problems.push('Hay migraciones fallidas sin resolver: prisma migrate deploy se negará a continuar (P3009).')
if (out.migrations.rolledBackAndNotReapplied.length) problems.push('Migraciones revertidas y no reaplicadas.')
if (out.migrations.unknownToRepo.length) problems.push('La base tiene migraciones que este árbol no conoce (¿otra versión más nueva?).')
if (out.candidates.length !== 1) problems.push(`Se esperaba exactamente 1 empresa E2E y hay ${out.candidates.length}: detente antes de escribir.`)
if (out.duplicates.sessions || out.duplicates.shifts) problems.push('Cajas o turnos abiertos duplicados: la migración 1 abortaría.')
if (problems.length) { console.error('\nPROBLEMAS:\n- ' + problems.join('\n- ')); process.exit(1) }
console.log('\nPreflight sin bloqueos.' + (out.migrations.pending.length ? ` Migraciones pendientes: ${out.migrations.pending.length}.` : ' Sin migraciones pendientes.'))
