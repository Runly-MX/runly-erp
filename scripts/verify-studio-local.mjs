// One-command Studio validation. All writes use a fresh, disposable Docker DB.
// Never loads .env, starts workers, runs deployment entrypoints or contacts Auth/Storage.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const name = `runly-studio-verification-${randomBytes(6).toString('hex')}`
const password = randomBytes(24).toString('hex')
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error(`${command} failed (${result.status}): ${result.stderr || ''}`)
  return result.stdout?.trim() ?? ''
}
let started = false
try {
  run('docker', ['run', '--pull=never', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=studio_verification', 'postgres:18'])
  started = true
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw Error('Disposable PostgreSQL did not become ready')
  const port = run('docker', ['port', name, '5432/tcp']).match(/:(\d+)$/)[1]
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/studio_verification`
  const env = { ...process.env, STUDIO_TEST_DATABASE_URL: url, RUNLY_SCHEMA_TEST_DATABASE_URL: url, DATABASE_URL: url, DIRECT_URL: url,
    SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' }
  const files = run('git', ['ls-files', '*test.js', '*test.mjs']).split(/\r?\n/).filter(path =>
    /^(packages\/(core|module-engine|module-compiler|sdk|ui)\/|apps\/(shared\/studio|api\/src\/routes\/(studio|canvas|pos|notes|projects)\/|desktop\/src\/modules\/(runly|atlas)\.(studio|canvas|pos|notes|projects)\/))/.test(path) && !path.includes('integration'))
  files.push('apps/api/src/services/__tests__/auth-middleware.test.js', 'apps/api/src/services/__tests__/jwt-verification.test.js',
    ...run('git', ['ls-files', 'apps/api/src/services/__tests__/*test.js']).split(/\r?\n/).filter(path => /\/(files-|realtime-|rbac-granular)/.test(path)),
    'apps/desktop/src/lib/__tests__/authorizedRealtime.test.js')
  run(process.execPath, ['--test', ...files], { env, stdio: 'inherit' })
  run(process.execPath, ['scripts/verify-studio-browser.mjs'], { env, stdio: 'inherit' })
  run(process.execPath, ['scripts/verify-studio-ui.mjs'], { env, stdio: 'inherit' })
  console.log('Studio local verification passed. Auth identity/grants and Storage in the UI remain fixtures; SQL, Prisma, JWT verification, React, Fabric and PNG are real.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (started) run('docker', ['stop', name])
}
