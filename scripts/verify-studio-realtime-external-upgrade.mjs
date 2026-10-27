// External Installer regression using only a verified, disposable local DB.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { prepareExternalStudioRealtime } from '../infra/installer/lib/studio-realtime-external.mjs'

const image = 'runly-studio-realtime:df739fe4-api'
const migration = '20261210000000_studio_realtime_ephemeral'
const stack = await createStudioStack({ apiImage: 'runly-studio-v7:ad3977d5-api' })
try {
  const config = JSON.parse(await readFile(stack.composeFile, 'utf8'))
  config.services['supabase-db'].volumes = config.services['supabase-db'].volumes.filter(v => !v.target.includes('studio-realtime-role'))
  await writeFile(stack.composeFile, JSON.stringify(config))
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'])
  await stack.verifyTarget(); await stack.initialize()
  const directory = join(stack.directory, 'external-installer')
  await mkdir(join(directory, '.secrets'), { recursive: true })
  const sqlFile = join(directory, 'supabase/volumes/db/studio-realtime-role.sql')
  await mkdir(resolve(sqlFile, '..'), { recursive: true })
  await copyFile('infra/installer/supabase/volumes/db/studio-realtime-role.sql', sqlFile)
  const appUrl = config.services['runly-api'].environment.DATABASE_URL
  const envFile = join(directory, '.env.external')
  await writeFile(envFile, `DATABASE_URL=${appUrl}\nDIRECT_URL=${appUrl}\n`)
  const options = { image, envFile, cwd: directory, dockerArgs: ['--network', `${stack.name}_default`] }
  prepareExternalStudioRealtime({ ...options, diagnose: true })
  assert.throws(() => prepareExternalStudioRealtime(options), /STUDIO_OWNER_PREPARATION_REQUIRED/)
  assert.equal((await stack.pool.query("SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")).rows[0].n, 0)
  assert.equal((await stack.pool.query("SELECT to_regrole('runly_studio_socket') IS NULL absent")).rows[0].absent, true)
  console.log('Insufficient application permissions stop before Prisma, without a failed record or leftover role')
  const ownerUrl = appUrl.replace('postgres:', 'supabase_admin:')
  await writeFile(envFile, `DATABASE_URL=${ownerUrl}\nDIRECT_URL=${ownerUrl}\n`)
  prepareExternalStudioRealtime(options)
  assert.equal((await stack.pool.query("SELECT has_schema_privilege('runly_studio_socket','realtime','USAGE') ready")).rows[0].ready, true)
  await stack.compose(['exec', '-T', 'supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c', 'REVOKE USAGE ON SCHEMA realtime FROM runly_studio_socket; DROP ROLE runly_studio_socket;'])
  await writeFile(envFile, `DATABASE_URL=${appUrl}\nDIRECT_URL=${appUrl}\n`)
  console.log('An already authorized database account prepares the feature without extra administrator configuration')
  config.services['runly-api'].image = image
  await writeFile(stack.composeFile, JSON.stringify(config))
  const migrate = () => stack.compose(['run', '--rm', '--no-deps', '--entrypoint', 'pnpm', 'runly-api', 'exec', 'prisma', 'migrate', 'deploy'])
  await assert.rejects(migrate())
  const adminFile = join(directory, '.secrets/studio-admin.env')
  await writeFile(adminFile, `SUPABASE_ADMIN_DATABASE_URL=${appUrl.replace('postgres:', 'supabase_admin:').replace('supabase-db:', 'wrong.example:')}\n`)
  assert.throws(() => prepareExternalStudioRealtime({ ...options, recover: true }), /STUDIO_ADMIN_TARGET_MISMATCH/)
  assert.equal((await stack.pool.query('SELECT rolled_back_at FROM _prisma_migrations WHERE migration_name=$1', [migration])).rows[0].rolled_back_at, null)
  await writeFile(adminFile, `SUPABASE_ADMIN_DATABASE_URL=${appUrl.replace('postgres:', 'supabase_admin:')}\n`)
  assert.throws(() => prepareExternalStudioRealtime(options), /STUDIO_KNOWN_FAILURE/)
  prepareExternalStudioRealtime({ ...options, recover: true })
  await migrate()
  prepareExternalStudioRealtime(options)
  await migrate()
  assert.equal((await stack.pool.query('SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name=$1', [migration])).rows[0].n, 2)
  assert.equal((await stack.pool.query("SELECT count(*)::int n FROM pg_policies WHERE policyname IN ('studio_socket_read','studio_socket_write')")).rows[0].n, 2)
  assert.equal((await stack.pool.query("SELECT with_check FROM pg_policies WHERE policyname='runly_realtime_server_writes'")).rows[0].with_check, 'false')
  console.log('External recovery uses a separate owner connection; original failed record is preserved and repeated upgrades succeed')
} finally { await stack.close() }
