// Own disposable container only. Never reads DATABASE_URL, .env or an external stack.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'runly-website-postgres-'))
const name = `runly-website-test-${randomUUID().slice(0, 12)}`
const network = `${name}-network`
const docker = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
let started = false
let networkCreated = false
const major = process.argv.includes('--postgres17') ? '17' : '18'
try {
  // A dedicated bridge permits the host-only published port on Docker Desktop.
  // No existing container is joined; inter-container communication is disabled.
  docker(['network','create','--driver','bridge','--opt','com.docker.network.bridge.enable_icc=false','--label','runly.test=website',network])
  networkCreated = true
  docker(['run', '--pull=never', '--detach', '--rm', '--name', name, '--network', network, '--label', 'runly.test=website', '--tmpfs', `${major === '17' ? '/var/lib/postgresql/data' : '/var/lib/postgresql'}:rw`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=website_s2_test', '-p', '127.0.0.1::5432', `postgres:${major}-alpine`])
  started = true
  let ready = false
  for (let i = 0; i < 60; i++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h','127.0.0.1', '-U', 'postgres', '-d', 'website_s2_test'], { stdio: 'ignore' }).status === 0) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready')
  const port = docker(['port', name, '5432/tcp']).trim()
  if (!/^127\.0\.0\.1:\d+$/.test(port)) throw new Error('Non-loopback test binding')
  const url = `postgresql://postgres@${port}/website_s2_test`
  const psql = sql => execFileSync('docker', ['exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'website_s2_test', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], maxBuffer: 16 * 1024 * 1024 })
  console.log(psql('SELECT version()').trim())
  if (major === '17') psql(readFileSync(join(root,'prisma/migrations/20260525193000_core_only_baseline/migration.sql'),'utf8').split('-- CreateSchema')[0])
  const schema = execFileSync('git', ['show', '8ba6c6209760f462aaee238bd0bd88d6452e30ff:prisma/schema.prisma'], { cwd: root })
  writeFileSync(join(temp, 'schema.prisma'), schema)
  writeFileSync(join(temp, 'prisma.config.mjs'), 'export default { schema: "./schema.prisma", datasource: { url: "postgresql://postgres@127.0.0.1:1/website_s2_test" } };')
  const sql = execFileSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', join(temp, 'schema.prisma'), '--script'], { cwd: temp, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (!sql.includes('CREATE TABLE "website_site"')) throw new Error('Missing baseline DDL')
  psql(sql)
  console.log(`Preflight S1: ${psql("SELECT count(*) FROM pg_class WHERE relname LIKE 'website_%' AND relkind='r' AND NOT relrowsecurity").trim()} Website tables without RLS in reconstructed baseline`)
  psql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated;")
  psql('CREATE POLICY legacy_test_allow ON website_site FOR SELECT TO PUBLIC USING (true);')
  // Historical record predates S2. It must survive migration byte for byte.
  psql("INSERT INTO company(id,name,slug,updated_at) VALUES ('01900000-0000-7000-8000-000000000901','Historical fixture','website-historical',now()); INSERT INTO website_site(id,company_id,name,domain,updated_at) VALUES ('01900000-0000-7000-8000-000000000902','01900000-0000-7000-8000-000000000901','Historical site','history.example.test',now()); INSERT INTO website_page(id,company_id,site_id,title,slug,route_path,status,draft_builder_data,published_builder_data,seo,updated_at) VALUES ('01900000-0000-7000-8000-000000000903','01900000-0000-7000-8000-000000000901','01900000-0000-7000-8000-000000000902','Historical page','old','/old','published','\"historical opaque draft\"','{\"public\":\"original\"}','{\"title\":\"Original\"}',now());")
  const migration = readFileSync(join(root, 'prisma/migrations/20261102093000_website_identity_drafts/migration.sql'), 'utf8')
  psql("UPDATE website_site SET settings='{\"legacy\":true}' WHERE id='01900000-0000-7000-8000-000000000902'; INSERT INTO website_form(id,company_id,site_id,name,updated_at) VALUES ('01900000-0000-7000-8000-000000000905','01900000-0000-7000-8000-000000000901','01900000-0000-7000-8000-000000000902','Historical form',now()); INSERT INTO website_form_submission(id,company_id,form_id,data) VALUES ('01900000-0000-7000-8000-000000000906','01900000-0000-7000-8000-000000000901','01900000-0000-7000-8000-000000000905','{\"historical\":\"response\"}'); INSERT INTO catalog_product(id,company_id,name,slug,price,updated_at) VALUES ('01900000-0000-7000-8000-000000000908','01900000-0000-7000-8000-000000000901','Historical product','historical-product',10,now());")
  psql("INSERT INTO website_page(id,company_id,site_id,title,slug,route_path,draft_builder_data,updated_at) VALUES ('01900000-0000-7000-8000-000000000904','01900000-0000-7000-8000-000000000901','01900000-0000-7000-8000-000000000999','Unresolved historical owner','orphan','/orphan','{\"preserve\":true}',now());")
  let rolledBack = false
  try { psql(migration.replace('COMMIT;', 'SELECT 1/0; COMMIT;')) } catch { rolledBack = true }
  if (!rolledBack || psql("SELECT count(*) FROM information_schema.columns WHERE table_name='website_site' AND column_name='draft_revision'").trim() !== '0') throw new Error('Failed migration did not roll back')
  console.log('Migration failure injection: additive DDL/backfill rolled back')
  psql(migration)
  psql("INSERT INTO company(id,name,slug,updated_at) VALUES ('01900000-0000-7000-8000-000000000911','Duplicate host fixture','duplicate-host-fixture',now()); INSERT INTO website_site(id,company_id,name,domain,updated_at) VALUES ('01900000-0000-7000-8000-000000000909','01900000-0000-7000-8000-000000000901','Unresolved host A','https://duplicate.example.test',now()),('01900000-0000-7000-8000-000000000910','01900000-0000-7000-8000-000000000911','Unresolved host B','www.duplicate.example.test',now());")
  const releaseMigration=readFileSync(join(root,'prisma/migrations/20261102110000_website_releases/migration.sql'),'utf8')
  const oldTrigger=psql("SELECT pg_get_functiondef('website_touch_draft_site'::regproc)")
  let releaseRolledBack=false
  try{psql(releaseMigration.replace('COMMIT;','SELECT 1/0; COMMIT;'))}catch{releaseRolledBack=true}
  if(!releaseRolledBack||psql("SELECT count(*) FROM information_schema.columns WHERE table_name='website_site' AND column_name='active_release_id'").trim()!=='0'||psql("SELECT pg_get_functiondef('website_touch_draft_site'::regproc)")!==oldTrigger)throw new Error('S3 migration failed to roll back')
  console.log('S3 migration failure injection: DDL, mapping and replaced triggers rolled back')
  psql(releaseMigration)
  const importMigration=readFileSync(join(root,'prisma/migrations/20261102140000_website_import_preview/migration.sql'),'utf8')
  let importRolledBack=false
  try{psql(importMigration.replace('COMMIT;','SELECT 1/0; COMMIT;'))}catch{importRolledBack=true}
  if(!importRolledBack||psql("SELECT to_regclass('website_import') IS NULL").trim()!=='t')throw new Error('S4 migration failed to roll back')
  console.log('S4 migration failure injection: imports, bindings and preview schema rolled back')
  psql(importMigration)
  const scopeMigration=readFileSync(join(root,'prisma/migrations/20261102180000_website_form_scope/migration.sql'),'utf8')
  let scopeRolledBack=false
  try{psql(scopeMigration.replace('COMMIT;','SELECT 1/0; COMMIT;'))}catch{scopeRolledBack=true}
  if(!scopeRolledBack||psql("SELECT to_regclass('website_form_scope') IS NULL").trim()!=='t')throw new Error('FormScope migration rollback failed')
  psql(scopeMigration)
  console.log('FormScope migration rollback/retention verified')
  // Later Website migrations (catalog selection, registry projection, local hostnames) so current application code runs.
  for (const later of ['20261218120000_website_catalog_selection', '20261219120000_website_registry_projection', '20261220090000_website_local_hostnames']) psql(readFileSync(join(root, 'prisma/migrations', later, 'migration.sql'), 'utf8'))
  console.log('Later Website migrations applied')
  execFileSync(process.execPath, [join(root,'node_modules/prisma/build/index.js'),'generate','--schema',join(root,'prisma/schema.prisma')], { cwd: temp, stdio: ['ignore','pipe','pipe'] })
  console.log('Prisma client generated from current schema; application config not loaded')
  const result = spawnSync(process.execPath, ['--test',...(process.argv.includes('--templates-only')?['apps/api/src/routes/website/__tests__/website-templates-postgres.test.js']:process.argv.includes('--closure-only')?['apps/api/src/routes/website/__tests__/website-backend-closure-postgres.test.js']:process.argv.includes('--backend-closure')?['apps/api/src/routes/website/__tests__/website-releases-postgres.test.js','apps/api/src/routes/website/__tests__/website-backend-closure-postgres.test.js']:['apps/api/src/routes/website/__tests__/website-postgres.test.js','apps/api/src/routes/website/__tests__/website-releases-postgres.test.js','apps/api/src/routes/website/__tests__/website-imports-postgres.test.js'])], { cwd: root, env: { ...process.env, RUNLY_WEBSITE_TEST_DATABASE_URL: url, RUNLY_WEBSITE_TEST_DISPOSABLE: name,RUNLY_WEBSITE_TEST_SKIP_BROWSER:process.argv.includes('--skip-browser')?'1':'0' }, stdio: 'inherit' })
  process.exitCode = result.status ?? 1
  if(result.status===0&&process.argv.includes('--browser')){
    const browser=spawnSync(process.execPath,['scripts/website-s4-browser-lab.mjs'],{cwd:root,env:{...process.env,RUNLY_WEBSITE_TEST_DATABASE_URL:url,RUNLY_WEBSITE_TEST_DISPOSABLE:name},stdio:'inherit'});process.exitCode=browser.status??1
  }
} finally {
  if (started) {
    const label = docker(['inspect', '--format', '{{index .Config.Labels "runly.test"}}', name]).trim()
    if (label === 'website') docker(['stop', name])
  }
  if (networkCreated && docker(['network','inspect','--format','{{index .Labels "runly.test"}}',network]).trim() === 'website') docker(['network','rm',network])
  if (resolve(temp).startsWith(resolve(tmpdir()) + '\\runly-website-postgres-') || resolve(temp).startsWith(resolve(tmpdir()) + '/runly-website-postgres-')) rmSync(temp, { recursive: true })
}
