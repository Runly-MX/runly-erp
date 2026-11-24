#!/usr/bin/env node
// F1B Stage 2: non-root API image on disposable Docker resources only.
//   docker build -f infra/docker/api.Dockerfile -t runly-nonroot-test:api .
//   node scripts/security/verify-nonroot-image.mjs [--image runly-nonroot-test:api]
// Uses named volumes (Linux filesystem, like a VPS install), never real data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { createStudioStack, command } from '../fixtures/studio/supabase-stack.mjs'
import { checks } from './lib/disposable-stack.mjs'

const imageArg = process.argv.indexOf('--image')
const IMAGE = imageArg > 0 ? process.argv[imageArg + 1] : 'runly-nonroot-test:api'
const id = randomBytes(4).toString('hex')
const docker = (args, input) => new Promise((done) => {
  const c = spawn('docker', args, { windowsHide: true }); let out = '', err = ''
  c.stdout.on('data', (d) => { out += d }); c.stderr.on('data', (d) => { err += d })
  c.on('close', (code) => done({ code, out: out.trim(), err: err.trim() })); c.stdin.end(input)
})
// Same hardening the installer compose applies (infra/installer/docker-compose.yml).
const HARDENED = ['--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'FOWNER', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--security-opt', 'no-new-privileges']
const PROBE = 'id -u; id -g; grep CapEff /proc/self/status; touch /app/modules/custom/.w && echo modules-writable; touch /app/apps/api/bundles/.w && echo bundles-writable; (touch /app/apps/api/src/.w 2>/dev/null && echo code-writable) || echo code-readonly; cat /app/modules/custom/custom.legacy/data.txt 2>/dev/null; stat -c %u /app/modules/custom/custom.legacy/data.txt 2>/dev/null; true'
const run = (volume, extra = []) => docker(['run', '--rm', ...HARDENED, ...extra, '-v', `${volume}:/app/modules/custom`, '-e', 'RUNLY_SKIP_DB_INIT=1', IMAGE, 'sh', '-c', PROBE])
const { check, report } = checks()
const volumes = [`runly-nonroot-clean-${id}`, `runly-nonroot-upgrade-${id}`]
let stack
try {
  await check('clean install: drops to uid/gid 10001 with no effective capabilities', async () => {
    const r = await run(volumes[0])
    assert.equal(r.code, 0, r.err)
    const [uid, gid, cap] = r.out.split('\n')
    assert.equal(uid, '10001'); assert.equal(gid, '10001'); assert.match(cap, /CapEff:\s+0+$/)
    assert.match(r.out, /modules-writable/); assert.match(r.out, /bundles-writable/); assert.match(r.out, /code-readonly/)
  })
  await check('upgrade: root-owned modules volume is handed over and its data preserved', async () => {
    const seed = await docker(['run', '--rm', '-v', `${volumes[1]}:/d`, '--entrypoint', 'sh', IMAGE, '-c', 'mkdir -p /d/custom.legacy && echo datos-previos > /d/custom.legacy/data.txt && chown -R 0:0 /d && stat -c %u /d/custom.legacy/data.txt'])
    assert.equal(seed.out, '0', seed.err)
    const r = await run(volumes[1])
    assert.equal(r.code, 0, r.err)
    assert.match(r.out, /datos-previos/); assert.match(r.out, /\n10001$/)
    const again = await run(volumes[1])
    assert.ok(!/Handing/.test(again.err + again.out), 'second start must not chown again')
  })
  await check('started directly as non-root: nothing is changed and it still runs', async () => {
    const r = await docker(['run', '--rm', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '10001:10001', '-v', `${volumes[0]}:/app/modules/custom`, IMAGE, 'sh', '-c', 'id -u; touch /app/modules/custom/.w2 && echo ok'])
    assert.equal(r.code, 0, r.err); assert.equal(r.out, '10001\nok')
  })
  await check('real boot as non-root: migrations, seed and /health against a disposable database', async () => {
    stack = await createStudioStack({ apiImage: 'runly-security-unused:local' })
    await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
    await stack.verifyTarget()
    // The installer prepares this storage guard as supabase_admin; the API refuses to boot without it.
    await stack.compose(['exec', '-T', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
      `CREATE OR REPLACE FUNCTION storage.runly_notes_require_private_bucket() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS
      'BEGIN IF NEW.id IN (''runly-notes'',''atlas-notes'') AND NEW.public THEN RAISE EXCEPTION ''NOTES_BUCKET_MUST_REMAIN_PRIVATE''; END IF; RETURN NEW; END;';
      CREATE TRIGGER runly_notes_bucket_private_v1 BEFORE INSERT OR UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.runly_notes_require_private_bucket();`], { log: join(stack.directory, 'notes-guard.log') })
    const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@host.docker.internal:${stack.ports.db}/postgres`
    const name = `runly-nonroot-api-${id}`
    const started = await docker(['run', '-d', '--name', name, ...HARDENED, '--add-host', 'host.docker.internal:host-gateway', '-p', '127.0.0.1::4010', '-v', `${volumes[0]}:/app/modules/custom`,
      '-e', `DATABASE_URL=${dbUrl}`, '-e', `DIRECT_URL=${dbUrl}`, '-e', 'RUNLY_SKIP_DB_INIT=0', '-e', 'NODE_ENV=production', '-e', 'RUNLY_API_PORT=4010', '-e', 'RUNLY_MODULES_DIR=/app/modules/custom',
      '-e', `SUPABASE_URL=http://host.docker.internal:${stack.ports.kong}`, '-e', `SUPABASE_ANON_KEY=${stack.secret.SUPABASE_ANON_KEY}`, '-e', `SUPABASE_SERVICE_ROLE_KEY=${stack.secret.SUPABASE_SERVICE_ROLE_KEY}`,
      '-e', `SUPABASE_JWT_SECRET=${stack.secret.SUPABASE_JWT_SECRET}`, '-e', `JWT_SECRET=${stack.secret.SUPABASE_JWT_SECRET}`, '-e', 'RUNLY_MCP_ENABLED=false', IMAGE])
    assert.equal(started.code, 0, started.err)
    try {
      const port = (await docker(['port', name, '4010'])).out.split(':').pop()
      let healthy = false
      for (let i = 0; i < 240 && !healthy; i++) { try { healthy = (await fetch(`http://127.0.0.1:${port}/health`)).ok } catch {} if (!healthy) await new Promise((r) => setTimeout(r, 1000)) }
      const logs = await docker(['logs', name])
      assert.ok(healthy, `API never became healthy: ${(logs.out + logs.err).split('\n').filter((l) => !/postgres(ql)?:\/\/|KEY|SECRET/i.test(l)).slice(-8).join(' | ')}`)
      assert.match(logs.out + logs.err, /Applying database migrations/)
      assert.equal((await docker(['exec', name, 'sh', '-c', "ps -o user= -p 1; stat -c %u /proc/1"])).out.split('\n').pop(), '10001')
      assert.equal((await stack.pool.query(`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`)).rows[0].n > 250, true)
    } finally { await docker(['rm', '-f', name]) }
  })
} finally {
  report()
  for (const v of volumes) await docker(['volume', 'rm', '-f', v])
  if (stack) await stack.close().catch(() => {})
}
