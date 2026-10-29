// Installer operations with Internet blocked: a disposable Supabase stack is joined to a
// Docker `--internal` network (no route out, external DNS fails with EAI_AGAIN like the
// real incident) and every Installer one-shot runs only on that network.
// Regression: the legacy images must fail (Corepack downloads pnpm) and the new ones pass.
//   node scripts/verify-offline-runtime-e2e.mjs --api-image=... --worker-image=... --legacy-api-image=... --legacy-worker-image=...
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { verifyRuntimeImages } from '../infra/installer/lib/installer-runtime.mjs'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const images = { api: arg('api-image'), worker: arg('worker-image'), legacyApi: arg('legacy-api-image'), legacyWorker: arg('legacy-worker-image') }
for (const value of Object.values(images)) assert.match(value ?? '', /^[a-z0-9][a-z0-9./_-]*:[a-zA-Z0-9_.-]+$/)
const DOWNLOAD = /Corepack is about to download|registry\.npmjs\.org|EAI_AGAIN/
const wait = ms => new Promise(r => setTimeout(r, ms))
const results = []
const check = (name, fn) => fn().then(detail => { results.push({ name, ok: true, detail }); console.log(`ok   ${name}${detail ? ` (${detail})` : ''}`) })

const stack = await createStudioStack({ apiImage: images.api })
const network = `${stack.name}-offline`
const workers = []
try {
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
  await command('docker', ['network', 'create', '--internal', network])
  for (const service of ['supabase-db', 'supabase-kong']) await command('docker', ['network', 'connect', '--alias', service, network, (await stack.compose(['ps', '-q', service])).trim()])
  const { environment } = JSON.parse(await readFile(stack.composeFile, 'utf8')).services['runly-api']
  const envFile = join(stack.directory, 'offline.env')
  await writeFile(envFile, Object.entries({ ...environment, RUNLY_SKIP_DB_INIT: '0' }).map(([key, value]) => `${key}=${value}`).join('\n'))
  const offline = (image, args) => {
    const r = spawnSync('docker', ['run', '--rm', '--pull=never', '--network', network, '--env-file', envFile, image, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return { status: r.status, out: `${r.stdout}\n${r.stderr}` }
  }
  const migrations = async () => (await stack.pool.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present")).rows[0].present

  await check('Internet blocked, disposable database reachable', async () => {
    const dns = offline(images.api, ['node', '-e', "require('node:dns').lookup('registry.npmjs.org',e=>{console.log(e?e.code:'RESOLVED');process.exitCode=e?0:1})"])
    assert.equal(dns.status, 0, dns.out)
    const db = offline(images.api, ['node', '-e', "const c=new (require('pg').Client)({connectionString:process.env.DIRECT_URL});c.connect().then(()=>c.query('select 1')).then(()=>c.end()).then(()=>console.log('DB_OK'))"])
    assert.match(db.out, /DB_OK/)
    return `registry.npmjs.org -> ${dns.out.trim()}`
  })

  // Regression: what the published images did on the server.
  await check('legacy API image: pnpm needs a download and db:migrate fails before Prisma', async () => {
    const version = offline(images.legacyApi, ['pnpm', '--version'])
    assert.notEqual(version.status, 0); assert.match(version.out, DOWNLOAD)
    const migrate = offline(images.legacyApi, ['pnpm', 'db:migrate'])
    assert.notEqual(migrate.status, 0); assert.match(migrate.out, /pnpm-9\.15\.0\.tgz/)
    assert.equal(await migrations(), false, 'no migration may run')
  })
  await check('Installer rejects the legacy images with a clear runtime-dependency error', async () => {
    for (const [kind, image] of [['api', images.legacyApi], ['worker', images.legacyWorker]]) {
      assert.throws(() => verifyRuntimeImages({ cwd: stack.directory, mode: 'local', images: { [kind]: image } }),
        new RegExp(`INSTALLER_RUNTIME_DEPENDENCY_UNAVAILABLE: ${kind} image .* needs to download pnpm@9\\.15\\.0 from the npm registry`))
    }
  })

  await check('Installer accepts the new images (contract studio-realtime-1, pnpm offline)', async () => {
    const pinned = verifyRuntimeImages({ cwd: stack.directory, mode: 'local', images: { api: images.api, worker: images.worker } })
    assert.match(pinned.api, /^sha256:/); assert.match(pinned.worker, /^sha256:/)
  })
  await check('new API image: pnpm --version offline', async () => {
    const r = offline(images.api, ['pnpm', '--version'])
    assert.equal(r.status, 0, r.out); assert.doesNotMatch(r.out, DOWNLOAD)
    return r.out.trim()
  })
  await check('new API image: pnpm db:migrate offline (migrate deploy + prisma generate)', async () => {
    const r = offline(images.api, ['pnpm', 'db:migrate'])
    assert.equal(r.status, 0, r.out); assert.doesNotMatch(r.out, DOWNLOAD)
    assert.equal(await migrations(), true)
    const failed = (await stack.pool.query('SELECT count(*)::int AS n FROM public._prisma_migrations WHERE finished_at IS NULL')).rows[0].n
    assert.equal(failed, 0)
    return `${(await stack.pool.query('SELECT count(*)::int AS n FROM public._prisma_migrations')).rows[0].n} migrations applied`
  })
  await check('new API image: pnpm db:seed offline', async () => {
    const r = offline(images.api, ['pnpm', 'db:seed'])
    assert.equal(r.status, 0, r.out); assert.doesNotMatch(r.out, DOWNLOAD)
    return `${(await stack.pool.query('SELECT count(*)::int AS n FROM runly_module')).rows[0].n} modules seeded`
  })
  await check('new API image: entrypoint migrate (pnpm exec prisma) and recovery CLI offline', async () => {
    const r = offline(images.api, ['pnpm', 'exec', 'prisma', 'migrate', 'deploy'])
    assert.equal(r.status, 0, r.out); assert.match(r.out, /No pending migrations/)
    for (const image of [images.api, images.legacyApi]) {
      const cli = offline(image, ['node', 'node_modules/prisma/build/index.js', 'migrate', 'status'])
      assert.equal(cli.status, 0, cli.out); assert.doesNotMatch(cli.out, DOWNLOAD)
    }
  })

  const startWorker = async image => {
    const id = (await command('docker', ['run', '-d', '--pull=never', '--network', network, '--env-file', envFile, image])).trim()
    workers.push(id)
    await wait(25000)
    const [state] = JSON.parse(await command('docker', ['inspect', id]))
    const logs = spawnSync('docker', ['logs', id], { encoding: 'utf8' })
    return { id, running: state.State.Running, logs: `${logs.stdout}\n${logs.stderr}` }
  }
  await check('legacy Worker image: start fails trying to download pnpm', async () => {
    const worker = await startWorker(images.legacyWorker)
    assert.equal(worker.running, false); assert.match(worker.logs, DOWNLOAD)
  })
  await check('new Worker image: CMD pnpm starts node offline and keeps running', async () => {
    const worker = await startWorker(images.worker)
    assert.equal(worker.running, true, worker.logs); assert.doesNotMatch(worker.logs, DOWNLOAD)
    assert.match(await command('docker', ['top', worker.id]), /node src\/index\.js/)
  })
} finally {
  for (const id of workers) await command('docker', ['rm', '-f', id]).catch(() => {})
  await command('docker', ['network', 'disconnect', '-f', network, (await stack.compose(['ps', '-q', 'supabase-db']).catch(() => '')).trim()]).catch(() => {})
  await command('docker', ['network', 'disconnect', '-f', network, (await stack.compose(['ps', '-q', 'supabase-kong']).catch(() => '')).trim()]).catch(() => {})
  await command('docker', ['network', 'rm', network]).catch(() => {})
  await writeFile(join(stack.directory, 'offline-results.json'), JSON.stringify(results, null, 2)).catch(() => {})
  await stack.close()
}
console.log(`\n${results.length} checks passed; evidence in ${stack.directory}`)
