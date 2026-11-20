// Commerce (POS + catalog) PostgreSQL suites on the CURRENT schema with every trigger and
// membership guard enabled, as in production. scripts/test-commerce-postgres.mjs keeps its
// migration-preservation checks on a frozen historical schema; this one answers "does the
// code work on the schema we deploy?".
//   node scripts/test-commerce-current-schema.mjs
// Disposable Supabase (scripts/fixtures/bookings): every migration + seed, then a schema-only
// copy as commerce_test (the database name the suites require). Nothing else is touched.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'

const s = await bootBookingsStack({ web: false })
let status = 1
try {
  const psql = (database, sql) => s.stack.compose(['exec', '-T', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1', '-qc', sql])
  await psql('postgres', 'DROP DATABASE IF EXISTS commerce_test')
  await psql('postgres', 'CREATE DATABASE commerce_test')
  await s.stack.compose(['exec', '-T', 'supabase-db', 'sh', '-c', 'pg_dump -U supabase_admin -d postgres --schema-only --no-owner --no-privileges | psql -q -v ON_ERROR_STOP=1 -U supabase_admin -d commerce_test'])
  // The suites connect as postgres; the copy was created by supabase_admin. Triggers stay enabled.
  await psql('commerce_test', 'GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres; GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres')
  const url = new URL(s.dbUrl); url.pathname = '/commerce_test'
  const files = ['apps/api/src/routes/pos/__tests__', 'apps/api/src/routes/catalog/__tests__']
    .flatMap((folder) => readdirSync(resolve(folder)).filter((f) => f.endsWith('.test.js')).map((f) => `${folder}/${f}`))
    .concat(['apps/api/src/manifests/official/__tests__/runly-pos-contract.test.js', 'apps/api/src/routes/__tests__/commerce-sync-guard.test.js',
      'apps/api/src/services/__tests__/sync-push-service.test.js', 'packages/sdk/src/__tests__/pos-recovery.test.js', 'packages/sdk/src/__tests__/catalog-integrity.test.js',
      'apps/desktop/src/modules/runly.pos/lib/plannerObjects.test.js', 'apps/desktop/src/modules/runly.pos/lib/floorObjects.test.js'])
  const result = spawnSync(process.execPath, ['--test', ...files], { env: { ...process.env, RUNLY_COMMERCE_TEST_DATABASE_URL: url.toString() }, stdio: 'inherit' })
  status = result.status ?? 1
} finally {
  await s.close()
  process.exitCode = status
}
