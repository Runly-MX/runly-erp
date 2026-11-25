// Runs apps/api/src/services/__tests__/sync-postgres.test.js against its own disposable PostgreSQL container
// (label runly.test=sync, loopback only, tmpfs). Never reads DATABASE_URL or .env.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'runly-sync-postgres-'))
const name = `runly-sync-test-${randomUUID().slice(0, 12)}`
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
let started = false
try {
  docker(['run', '--pull=never', '--detach', '--rm', '--name', name, '--label', 'runly.test=sync', '--tmpfs', '/var/lib/postgresql:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=sync_test', '-p', '127.0.0.1::5432', 'postgres:18-alpine'])
  started = true
  let ready = false
  for (let i = 0; i < 80 && !ready; i++) {
    ready = spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'sync_test'], { stdio: 'ignore' }).status === 0
    if (!ready) await new Promise((r) => setTimeout(r, 250))
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready')
  const port = docker(['port', name, '5432/tcp']).trim()
  if (!/^127\.0\.0\.1:\d+$/.test(port)) throw new Error('Non-loopback test binding')
  const url = `postgresql://postgres@${port}/sync_test`
  const psql = (sql) => execFileSync('docker', ['exec', '-i', name, 'psql', '-U', 'postgres', '-d', 'sync_test', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  console.log(psql('SELECT version()').trim())
  writeFileSync(join(temp, 'prisma.config.mjs'), `export default { schema: ${JSON.stringify(join(root, 'prisma/schema.prisma'))}, datasource: { url: "postgresql://postgres@127.0.0.1:1/sync_test" } };`)
  const sql = execFileSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', join(root, 'prisma/schema.prisma'), '--script', '--config', join(temp, 'prisma.config.mjs')], { cwd: temp, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  psql(sql)
  console.log('Current Prisma schema applied (core tables only; RME3 tables are not part of /sync/pull)')
  const result = spawnSync(process.execPath, ['--test', 'apps/api/src/services/__tests__/sync-postgres.test.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, RUNLY_SYNC_TEST_DATABASE_URL: url, RUNLY_SYNC_TEST_DISPOSABLE: name } })
  process.exitCode = result.status ?? 1
} finally {
  if (started && docker(['inspect', '--format', '{{index .Config.Labels "runly.test"}}', name]).trim() === 'sync') docker(['stop', name])
  rmSync(temp, { recursive: true, force: true })
}
