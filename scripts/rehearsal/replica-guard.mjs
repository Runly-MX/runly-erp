// node scripts/rehearsal/replica-guard.mjs --env-file=<replica .env.external> [--print-overrides]
// Exit 1 when the replica environment could reach outside; output has variable names only, never values.
import { readFile } from 'node:fs/promises'
import { checkReplicaEnv, parseEnv, NEUTRALIZING_OVERRIDES } from './lib/replica-guard.mjs'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
if (process.argv.includes('--print-overrides')) {
  for (const [name, value] of Object.entries(NEUTRALIZING_OVERRIDES)) console.log(`${name}=${value}`)
  process.exit(0)
}
const file = arg('env-file')
if (!file) { console.error('--env-file=<path> is required'); process.exit(2) }
const findings = checkReplicaEnv(parseEnv(await readFile(file, 'utf8')))
for (const finding of findings) console.log(`${finding.name}: ${finding.reason}`)
console.log(findings.length ? `${findings.length} setting(s) could reach outside the replica` : 'No setting reaches outside the replica')
process.exitCode = findings.length ? 1 : 0
