// Fresh local/external installs, image mismatch and authenticated-role analysis.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { prepareExternalStudioRealtime } from '../infra/installer/lib/studio-realtime-external.mjs'
import { createStudioDatabaseRunner, prepareStudioRealtimeOwner } from '../infra/installer/lib/studio-realtime-db.mjs'
import { verifyRuntimeImages, resolveComposeMigrationNetwork } from '../infra/installer/lib/installer-runtime.mjs'

const base = 'runly-studio-realtime:df739fe4-api', image = 'runly-installer-closure:compatible-api', incompatible = 'runly-installer-closure:wrong-sql'
const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
await command('docker', ['build', '--pull=false', '-t', image, '-'], { input: `FROM ${base}\nLABEL io.runly.installer.contract="studio-realtime-1"\n` })
await command('docker', ['build', '--pull=false', '-t', incompatible, '-'], { input: `FROM ${image}\nRUN echo '-- incompatible' >> /app/prisma/migrations/20261210000000_studio_realtime_ephemeral/migration.sql\n` })
for (const mode of ['local', 'external']) {
  const stack = await createStudioStack({ apiImage: image })
  try {
    const config = JSON.parse(await readFile(stack.composeFile, 'utf8'))
    config.services['supabase-db'].volumes = config.services['supabase-db'].volumes.filter(v => !v.target.includes('studio-realtime-role'))
    // Prove overridden network names are respected by local migration jobs.
    config.networks.default.name = `${stack.name}-custom`
    await writeFile(stack.composeFile, JSON.stringify(config))
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'])
    await stack.verifyTarget()
    const directory = join(stack.directory, 'installer')
    await mkdir(join(directory, '.secrets'), { recursive: true })
    const sqlFile = join(directory, 'supabase/volumes/db/studio-realtime-role.sql')
    await mkdir(resolve(sqlFile, '..'), { recursive: true }); await copyFile('infra/installer/supabase/volumes/db/studio-realtime-role.sql', sqlFile)
    const envFile = join(directory, `.env.${mode}`), appUrl = config.services['runly-api'].environment.DATABASE_URL
    await writeFile(envFile, `DATABASE_URL=${appUrl}\nDIRECT_URL=${appUrl}\n`)
    const composeArgs = ['--project-name', stack.name, '--env-file', join(stack.directory, 'test.env'), '-f', stack.composeFile]
    const dockerArgs = resolveComposeMigrationNetwork({ cwd: directory, composeArgs })
    assert.deepEqual(dockerArgs, ['--network', `${stack.name}-custom`])
    assert.throws(() => verifyRuntimeImages({ cwd: directory, mode, images: { api: base } }), /IMAGE_INCOMPATIBLE/)
    const pinned = verifyRuntimeImages({ cwd: directory, mode, images: { api: image } })
    const options = { image: pinned.api, envFile, cwd: directory, dockerArgs }
    assert.throws(() => prepareExternalStudioRealtime({ ...options, image: incompatible }), /IMAGE_MIGRATION_MISMATCH/)
    prepareExternalStudioRealtime({ ...options, diagnose: true })
    assert.throws(() => prepareExternalStudioRealtime(options), /STUDIO_OWNER_PREPARATION_REQUIRED/)
    assert.throws(() => prepareExternalStudioRealtime({ ...options, prepare: false }), /rerun the normal setup/)
    assert.equal((await stack.pool.query("SELECT to_regclass('public._prisma_migrations') IS NULL clean")).rows[0].clean, true)
    if (mode === 'local') {
      await prepareStudioRealtimeOwner({ execute: createStudioDatabaseRunner({ cwd: directory, composeArgs }), sqlFile })
    } else {
      await writeFile(join(directory, '.secrets/studio-admin.env'), `SUPABASE_ADMIN_DATABASE_URL=${appUrl.replace('postgres:', 'supabase_admin:')}\n`)
    }
    prepareExternalStudioRealtime(options)
    prepareExternalStudioRealtime({ ...options, prepare: false })
    await stack.initialize()
    const history = (await stack.pool.query('SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows
    prepareExternalStudioRealtime(options)
    await stack.compose(['run', '--rm', '--no-deps', '--entrypoint', 'node', 'runly-api', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'])
    assert.deepEqual((await stack.pool.query('SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows, history)
    const names = (await stack.pool.query("SELECT policyname,with_check FROM pg_policies WHERE schemaname='realtime' AND policyname='runly_realtime_server_writes'")).rows
    assert.equal(names[0].with_check, 'false')
    const client = await stack.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("CREATE POLICY studio_installer_auth_probe ON realtime.messages FOR INSERT TO authenticated WITH CHECK (topic LIKE 'studio:ephemeral:%')")
      assert.equal((await client.query("SELECT has_table_privilege('authenticated','realtime.messages','INSERT') ready")).rows[0].ready, true)
      await client.query('SET LOCAL ROLE authenticated')
      // A permissive topic policy cannot override the shared restrictive deny.
      await assert.rejects(client.query("INSERT INTO realtime.messages(topic,extension,event,payload,private) VALUES('studio:ephemeral:probe@1','broadcast','ephemeral:v1','{}',true)"), /row-level security/)
    } finally { await client.query('ROLLBACK'); client.release() }
    for (const table of ['public.notes', 'public.canvas_board']) {
      const privileges = (await stack.pool.query('SELECT has_table_privilege($1,$3,$4) AS scoped,has_table_privilege($2,$3,$4) AS authenticated', ['runly_studio_socket', 'authenticated', table, 'SELECT'])).rows[0]
      assert.equal(privileges.scoped, false)
      console.log(`${mode}: ${table} privileges ${JSON.stringify(privileges)}`)
    }
    console.log(`${mode}: clean preparation + all migrations + seed + repeated upgrade PASS; old image and changed migration rejected before Prisma`)
  } finally { await stack.close() }
}
