// Quality gates in two tiers. Every gate here is green on main today; a red gate means a real regression.
//   node scripts/ci/run-gates.mjs fast      lint, privacy, company scope, dependency/UUID/schema policies, perf source guards,
//                                           and a curated set of contract tests. No build, no database, no browser (~1 min).
//   node scripts/ci/run-gates.mjs release   fast + web build + bundle budgets + security suites
//                                           (+ HTTP payload contract when RUNLY_CONTRACT_API is set,
//                                           + full-suite comparison against the baseline with --full-suite).
// Options: --only <substring>  run just the matching steps; --keep-going (default for fast) / --fail-fast.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const tier = process.argv[2]
if (!['fast', 'release'].includes(tier)) { console.error('Usage: node scripts/ci/run-gates.mjs <fast|release> [--only text] [--fail-fast] [--full-suite]'); process.exit(2) }
const flag = (name) => process.argv.includes(name)
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const node = process.execPath
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

// Stable, fast contract tests that guard the stabilization work. Add a test here when it protects a contract that
// regressed once; do not add anything that needs a browser, a database or the network.
const CONTRACT_TESTS = [
  'apps/api/src/lib/__tests__/blueprint-query.test.js',
  'apps/api/src/lib/__tests__/runtime-modules-slim.test.js',
  'apps/api/src/lib/__tests__/quarantine-flags.test.js',
  'apps/api/src/lib/__tests__/client-ip.test.js',
  'apps/desktop/src/lib/__tests__/authorizedRealtime.test.js',
  'apps/desktop/src/modules/runly.chat/calls/__tests__/callSoundsDeferred.test.js',
  'apps/desktop/src/modules/runly.chat/calls/__tests__/callSoundActivation.test.js',
  'apps/api/src/services/__tests__/files-visibility.test.js',
  'apps/api/src/services/__tests__/help-capabilities.test.js',
  'apps/api/src/services/__tests__/runly-module-registration.test.js',
  'apps/api/src/manifests/official/__tests__/pwa-identities.test.js',
  'apps/api/src/manifests/official/__tests__/storefront-capture-foundation-contract.test.js',
  'apps/api/src/mcp/__tests__/domain-contracts.test.js',
  'scripts/__tests__/runly-module-identity.test.js',
  'scripts/__tests__/runly-env-config.test.js',
  'scripts/__tests__/installer-devkit-snapshot.test.js',
  'scripts/tests/docker-shared-sources.test.mjs',
  'scripts/tests/shared-consumer-registry.test.mjs',
  'infra/installer/__tests__/installer-release.test.js',
  'infra/installer/lib/trusted-proxies.test.mjs',
]

const FAST = [
  ['lint (eslint, errors only)', npx, ['eslint', '.', '--quiet']],
  ['repository privacy', node, ['scripts/check-repository-privacy.mjs']],
  ['company-scoped requests in module screens', node, ['scripts/check-company-scope.mjs']],
  ['dependency policy (no floating specifiers)', node, ['scripts/check-dependency-policy.mjs']],
  ['UUID policy', node, ['scripts/enforce-uuid-policy.mjs']],
  ['Supabase managed-schema ownership', node, ['scripts/enforce-supabase-schema-ownership-policy.mjs']],
  ['performance guards (source)', node, ['scripts/ci/perf-guards.mjs']],
  ['contract tests', node, ['--test', ...CONTRACT_TESTS]],
]

const dist = join(tmpdir(), `runly-gates-dist-${process.pid}`)
const RELEASE = [
  ['web build', node, ['apps/desktop/scripts/build-web.mjs', '--outDir', dist, '--emptyOutDir'], { cwd: join(root, 'apps/desktop') }],
  ['performance guards (built bundle)', node, ['scripts/ci/perf-guards.mjs', '--dist', dist]],
  ['security suites', 'pnpm', ['test:security'], { shell: process.platform === 'win32' }],
]
if (process.env.RUNLY_CONTRACT_API) {
  RELEASE.push(['HTTP payload and authorization contract', node, ['docs/audits/perf-f3/scripts/http-contract.mjs', process.env.RUNLY_CONTRACT_API]])
}
if (flag('--full-suite')) RELEASE.push(['full suite: no new failures against the baseline', node, ['scripts/ci/full-suite-baseline.mjs']])

const steps = (tier === 'fast' ? FAST : [...FAST, ...RELEASE]).filter(([name]) => !only || name.includes(only))
const failFast = flag('--fail-fast')
const rows = []
for (const [name, cmd, args, options = {}] of steps) {
  const started = Date.now()
  console.log(`\n=== ${name}`)
  const run = spawnSync(cmd, args, { cwd: options.cwd ?? root, stdio: 'inherit', shell: options.shell ?? (process.platform === 'win32' && cmd.endsWith('.cmd')), env: process.env })
  const pass = run.status === 0
  rows.push({ name, pass, seconds: Math.round((Date.now() - started) / 1000) })
  if (!pass && failFast) break
}
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })
console.log(`\n=== ${tier} gates`)
for (const row of rows) console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}  (${row.seconds}s)`)
process.exit(rows.every((row) => row.pass) ? 0 : 1)
