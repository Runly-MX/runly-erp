#!/usr/bin/env node
// Reproducible classification of the privacy checker's non-example-ipv4
// findings by address class (RFC), printed without the address literals.
//   node scripts/security/classify-privacy-findings.mjs [--out file.json]
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = spawnSync(process.execPath, ['scripts/check-repository-privacy.mjs'], { encoding: 'utf8' })
const raw = `${run.stdout}
${run.stderr}`
const findings = [...raw.matchAll(/^(.+?):(\d+): non-example-ipv4/gm)].map((m) => ({ file: m[1], line: Number(m[2]) }))
const classOf = (ip) => {
  const [a, b, c] = ip.split('.').map(Number)
  if ([a, b, c].some((n) => n > 255 || Number.isNaN(n))) return 'invalid-on-purpose'
  if (a === 0) return 'unspecified-0.0.0.0/8'
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private-rfc1918'
  if (a === 127) return 'loopback'
  if (a === 169 && b === 254) return 'link-local'
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat-rfc6598'
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return 'documentation-rfc5737'
  return 'public-looking-fictional-test-address'
}
const out = findings.map(({ file, line }) => {
  const text = readFileSync(file, 'utf8').split(/\r?\n/)[line - 1] ?? ''
  const ips = [...text.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)].map((m) => m[0])
  return { file, line, classes: [...new Set(ips.map(classOf))] }
})
const summary = {}
for (const f of out) for (const c of f.classes.length ? f.classes : ['no-literal-on-line']) summary[c] = (summary[c] ?? 0) + 1
const result = { total: out.length, byFile: Object.entries(out.reduce((a, f) => ({ ...a, [f.file]: (a[f.file] ?? 0) + 1 }), {})), summary, findings: out }
console.log(JSON.stringify({ total: result.total, byFile: result.byFile, summary }, null, 2))
const i = process.argv.indexOf('--out'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(result, null, 2))
