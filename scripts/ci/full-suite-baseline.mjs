// Runs the whole Node test suite once and compares the failing test names with the recorded baseline.
//   node scripts/ci/full-suite-baseline.mjs            fail if a test fails that is not in the baseline
//   node scripts/ci/full-suite-baseline.mjs --write    rewrite the baseline with the current failures
// Baseline: docs/audits/evidence/suite-failures-baseline.txt (one failing test name per line; "[file] path" for a file that fails as a whole).
// Known failures stay visible there; a NEW failure fails the gate, and a baseline entry that now passes is reported so the list shrinks.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baselinePath = join(root, 'docs/audits/evidence/suite-failures-baseline.txt')
// Default test discovery from the repository root (node_modules excluded). Directory arguments are treated as files by `node --test`.
// Same files `node --test` finds by default (tracked or new, not ignored), except the laboratory orchestrators in scripts/test-*.mjs:
// they start Docker stacks and need RUNLY_HUB_REPO or other lab environment, so they are run by their own commands (docs/audits/RUNLY_RC_ACCEPTANCE_CHECKLIST.md), not as unit tests.
const DEFAULT_PATTERNS = [/(^|\/)[^/]*\.test\.[cm]?js$/, /(^|\/)[^/]*-test\.[cm]?js$/, /(^|\/)[^/]*_test\.[cm]?js$/, /(^|\/)test-[^/]*\.[cm]?js$/, /(^|\/)test\.[cm]?js$/, /(^|\/)test\/.*\.[cm]?js$/]
const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\n').map((f) => f.trim())
  .filter((f) => f && existsSync(join(root, f)) && DEFAULT_PATTERNS.some((re) => re.test(f)) && !/^scripts\/test-/.test(f))
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
const failing = new Set()
for (const line of output.split(/\r?\n/)) {
  const m = /^\s*not ok \d+ - (.+?)(?:\s+#.*)?$/.exec(line)
  if (!m) continue
  const name = m[1].trim()
  // scripts/test-*.mjs are end-to-end drivers that need a running stack (Docker, browsers); Node's default discovery picks them up by name only.
  if (/^scripts[\\/]test-[\w-]+\.mjs$/.test(name)) continue
  // A failing file is reported as its path; keep it distinguishable from test names.
  failing.add(/(?:^|[\\/])[\w.-]+\.(?:test\.)?(?:js|mjs)$/.test(name) && /[\\/]/.test(name) ? `[file] ${name.replaceAll('\\\\', '\\')}` : name)
}
const summary = /^# (tests|pass|fail|skipped) (\d+)/gm
const totals = Object.fromEntries([...output.matchAll(summary)].map((m) => [m[1], Number(m[2])]))
console.log(`Suite: ${totals.tests ?? '?'} tests, ${totals.pass ?? '?'} pass, ${totals.fail ?? '?'} fail, ${totals.skipped ?? '?'} skipped; ${failing.size} distinct failing names`)
if (process.argv.includes('--write')) {
  writeFileSync(baselinePath, [...failing].sort().join('\n') + '\n')
  console.log(`Baseline written: ${failing.size} entries`)
  process.exit(0)
}
const baseline = new Set(existsSync(baselinePath) ? readFileSync(baselinePath, 'utf8').split(/\r?\n/).filter(Boolean) : [])
const added = [...failing].filter((name) => !baseline.has(name))
const fixed = [...baseline].filter((name) => !failing.has(name))
for (const name of fixed) console.log(`FIXED  ${name}  (remove it from the baseline: --write)`)
for (const name of added) console.log(`NEW FAILURE  ${name}`)
process.exit(added.length ? 1 : 0)
