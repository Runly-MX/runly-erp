#!/usr/bin/env node
// Creates this installation's registry signing key. The private key goes into the env file (never printed);
// the public key is printed so a Runly platform operator can enroll the installation.
//   node scripts/registry-installation-key.mjs --env-file .env.external
import { generateKeyPairSync } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
const file = process.argv.find((a) => a.startsWith('--env-file='))?.slice(11) ?? (process.argv.includes('--env-file') ? process.argv[process.argv.indexOf('--env-file') + 1] : null)
if (!file || !existsSync(file)) { console.error('Usage: node scripts/registry-installation-key.mjs --env-file <path to an existing env file>'); process.exit(2) }
const text = readFileSync(file, 'utf8')
if (/^RUNLY_INSTALLATION_PRIVATE_KEY=.+$/m.test(text)) { console.error('RUNLY_INSTALLATION_PRIVATE_KEY already has a value; refusing to replace it.'); process.exit(1) }
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64url')
const line = `RUNLY_INSTALLATION_PRIVATE_KEY=${seed}`
if (/^RUNLY_INSTALLATION_PRIVATE_KEY=\s*$/m.test(text)) {
  // Fill the blank placeholder written by the installer instead of adding a duplicate.
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, text.replace(/^RUNLY_INSTALLATION_PRIVATE_KEY=\s*$/m, line), { mode: 0o600 })
} else appendFileSync(file, `\n${line}\n`, { mode: 0o600 })
console.log('Private key written to the env file (not shown).')
console.log(`Public key for enrollment: ${publicKey.export({ format: 'jwk' }).x}`)
