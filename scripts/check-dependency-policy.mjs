// Dependency policy gate (deterministic). Fails when a tracked package.json uses a floating specifier.
// `latest` and `*` make `pnpm install` re-resolve on every non-frozen run and move the bundler, icon library and
// React between builds of the same commit (see docs/audits/RUNLY_BUILD_REPRODUCIBILITY_REPORT.md).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FLOATING = new Set(['latest', '*', 'next', 'canary'])
const files = execFileSync('git', ['ls-files', '*package.json'], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.includes('node_modules'))
const problems = []
for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  for (const kind of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(pkg[kind] ?? {})) if (FLOATING.has(String(spec).trim())) problems.push(`${file}: ${kind}.${name} = "${spec}"`)
  }
}
if (problems.length) {
  console.error('Floating dependency specifiers are not allowed:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`Dependency policy: OK (${files.length} manifests, no floating specifiers)`)
