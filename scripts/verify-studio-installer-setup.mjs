// Actual setup entrypoints, production Compose, fresh disposable application DB.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createStudioStack, command, unusedPort } from './fixtures/studio/supabase-stack.mjs'
import { installRelease } from '../infra/installer/update-installer.mjs'

const images = { api: 'runly-installer-closure:setup-api', worker: 'runly-installer-closure:setup-worker', web: 'runly-installer-closure:setup-web' }
const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
for (const [kind, image] of Object.entries(images)) await command('docker', ['build', '--pull=false', '-t', image, '-'], { input: `FROM runly-studio-realtime:df739fe4-${kind}\nLABEL io.runly.installer.contract="studio-realtime-1"\n` })
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|pathext|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles(?:\(x86\))?|programw6432|homedrive|homepath|home)$/i.test(key)))
const manifest = JSON.parse(await readFile('infra/installer/installer-release.json', 'utf8'))
const sources = new Map(await Promise.all(Object.keys(manifest.files).map(async file => [file, Buffer.from((await readFile(`infra/installer/${file}`, 'utf8')).replaceAll('\r\n', '\n'))])))
for (const mode of ['local', 'external']) {
  const stack = await createStudioStack({ apiImage: images.api })
  stack.pool.on('error', () => {}) // Compose may recreate our disposable DB container.
  const directory = join(stack.directory, 'full-installer'), appName = mode === 'local' ? stack.name : `${stack.name}-app`
  const appCompose = ['compose', '--project-name', appName, '--env-file', join(directory, `.env.${mode}`), '-f', join(directory, 'docker-compose.yml'), '-f', join(directory, `docker-compose.${mode}.override.yml`)]
  if (mode === 'local') appCompose.push('-f', join(directory, 'supabase/docker-compose.supabase.yml'))
  try {
    const config = JSON.parse(await readFile(stack.composeFile, 'utf8'))
    config.services['supabase-db'].volumes = config.services['supabase-db'].volumes.filter(v => !v.target.includes('studio-realtime-role'))
    await writeFile(stack.composeFile, JSON.stringify(config))
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'])
    await stack.verifyTarget()
    await mkdir(directory)
    await installRelease({ root: directory, mode, ref: 'd'.repeat(40), manifest, readSource: file => sources.get(file) })
    const values = new Map((await readFile(join(stack.directory, 'test.env'), 'utf8')).split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    const appUrl = config.services['runly-api'].environment.DATABASE_URL
    const settings = {
      RUNLY_COMPOSE_PROJECT_NAME: appName, RUNLY_CONTAINER_PREFIX: appName, RUNLY_INSTANCE_ID: stack.name.slice(-8),
      RUNLY_API_HOST_PORT: String(stack.ports.api), RUNLY_WEB_HOST_PORT: String(stack.ports.web), RUNLY_PUBLIC_BIND_ADDR: '127.0.0.1',
      RUNLY_SUPABASE_MODE: 'selfhosted', RUNLY_SUPABASE_STUDIO_HOST_PORT: String(await unusedPort()),
      LIVEKIT_MODE: 'disabled', TRANSCRIPTION_MODE: 'disabled', MIRAI_TTS_MODE: 'disabled', BACKUP_MODE: 'disabled', RUNLY_OFFICE_ENABLED: 'false',
      RUNLY_API_LOCAL_IMAGE: images.api, RUNLY_WORKER_LOCAL_IMAGE: images.worker, RUNLY_WEB_LOCAL_IMAGE: images.web,
      RUNLY_API_IMAGE: images.api, RUNLY_WORKER_IMAGE: images.worker, RUNLY_WEB_EXTERNAL_IMAGE: images.web,
      DATABASE_URL: appUrl, DIRECT_URL: appUrl, SUPABASE_URL: 'http://supabase-kong:8000', RUNLY_SUPABASE_PUBLIC_URL: stack.urls.kong,
      SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: stack.secret.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_JWT_SECRET: stack.secret.SUPABASE_JWT_SECRET, RUNLY_INTERNAL_SECRET: stack.secret.SUPABASE_JWT_SECRET,
      RUNLY_API_URL: stack.urls.api, RUNLY_APP_URL: stack.urls.web, CORS_ORIGIN: stack.urls.web,
    }
    if (mode === 'external') settings.RUNLY_MIGRATION_NETWORK = `${stack.name}_default`
    for (const [key, value] of Object.entries(settings)) values.set(key, value)
    await writeFile(join(directory, `.env.${mode}`), [...values].map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
    const override = mode === 'local' ? { services: { 'supabase-db': { ports: [{ target: 5432, published: String(stack.ports.db), host_ip: '127.0.0.1' }] } } } : { networks: { default: { external: true, name: `${stack.name}_default` } } }
    await writeFile(join(directory, `docker-compose.${mode}.override.yml`), JSON.stringify(override))
    await mkdir(join(directory, 'custom-modules'), { recursive: true }); await writeFile(join(directory, 'custom-modules/.keep-fixture'), 'preserve-file')
    if (mode === 'external') {
      await mkdir(join(directory, '.secrets'), { recursive: true })
      await writeFile(join(directory, '.secrets/studio-admin.env'), `SUPABASE_ADMIN_DATABASE_URL=${appUrl.replace('postgres:', 'supabase_admin:')}\n`)
    }
    const run = suffix => command(process.execPath, [join(directory, `setup-${mode}.mjs`), '--skip-pull', '--skip-dev-kit'], { env: cleanEnv, log: join(stack.directory, `full-${mode}-${suffix}.log`) })
    await run('fresh')
    const history = (await stack.pool.query('SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows
    await stack.pool.query("CREATE TABLE studio_full_setup_probe(id integer PRIMARY KEY,value text); INSERT INTO studio_full_setup_probe VALUES(1,'preserve-data')")
    await run('repeat')
    assert.deepEqual((await stack.pool.query('SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows, history)
    assert.equal((await stack.pool.query('SELECT value FROM studio_full_setup_probe WHERE id=1')).rows[0].value, 'preserve-data')
    assert.equal(await readFile(join(directory, 'custom-modules/.keep-fixture'), 'utf8'), 'preserve-file')
    const selected = JSON.parse(await readFile(join(directory, '.runly-installer/images.json'), 'utf8'))
    assert.equal(selected.images.api.reference, images.api)
    const ownerInApi = await command('docker', ['inspect', `${appName}-api-${mode}`, '--format', '{{json .Config.Env}}'])
    assert.equal(ownerInApi.includes('SUPABASE_ADMIN_DATABASE_URL='), false)
    console.log(`${mode}: actual fresh setup and repeated setup PASS, production Compose, API/Worker/Web started; data, file, checksums and image selections preserved`)
  } finally {
    try {
      if (await readFile(join(directory, `.env.${mode}`)).catch(() => null)) await command('docker', [...appCompose, '--profile', mode, 'down', '--volumes', '--remove-orphans'], { env: { ...cleanEnv, RUNLY_COMPOSE_PROJECT_NAME: appName, RUNLY_CONTAINER_PREFIX: appName }, log: join(stack.directory, 'full-cleanup.log') })
    } finally { await stack.close() }
  }
}
