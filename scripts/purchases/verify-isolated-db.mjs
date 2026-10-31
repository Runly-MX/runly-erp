// Existing integration suites, each resetting only a newly created tmpfs DB.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { command, unusedPort } from '../fixtures/studio/supabase-stack.mjs'

const name = `runly-purchases-close-${randomBytes(6).toString('hex')}`
const password = randomBytes(24).toString('hex')
const port = await unusedPort()
assert.notEqual(port, 4010)
const dir = resolve('.e2e/closure-db')
await mkdir(dir, { recursive: true })
let pool
try {
  const endpoint = await command('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
  assert.match(endpoint, /^(npipe:|unix:)/)
  await command('docker', ['run', '-d', '--name', name, '--label', `runly.disposable=${name}`, '--tmpfs', '/var/lib/postgresql', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=runly_documentary_test', '-p', `127.0.0.1:${port}:5432`, 'postgres:18'])
  pool = new pg.Pool({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/runly_documentary_test` })
  for (let i = 0; i < 60; i++) {
    try { await pool.query('SELECT 1'); break } catch { await new Promise(r => setTimeout(r, 500)) }
  }
  for (const suite of ['purchase-inventory-bridge', 'purchase-documentary', 'purchase-payments', 'purchase-corrections']) {
    const [container] = JSON.parse(await command('docker', ['inspect', name]))
    assert.equal(container.Config.Labels['runly.disposable'], name)
    assert.equal(container.Mounts.some(m => m.Type === 'volume'), false)
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'runly_documentary_test')
    console.log('Verified disposable target:', name, port, suite)
    const url = `postgresql://postgres:${password}@127.0.0.1:${port}/runly_documentary_test`
    const output = await command(process.execPath, ['--test', `apps/api/src/services/__tests__/${suite}.integration.test.js`], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PURCHASES_DOCUMENTARY_TEST_DATABASE_URL: url, PURCHASES_TEST_DATABASE_URL: url },
      log: resolve(dir, `${suite}.log`),
    })
    console.log(output.split('\n').filter(l => /^# (tests|pass|fail|skipped)/.test(l)).join('\n'))
  }
} finally {
  await pool?.end()
  await command('docker', ['rm', '-f', name])
}
