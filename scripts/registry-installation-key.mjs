#!/usr/bin/env node
// This installation's registry signing key.
//   node scripts/registry-installation-key.mjs --env-file .env.external               create the first key
//   node scripts/registry-installation-key.mjs --env-file .env.external --rotate      introduce a new key (the current one stays valid for a grace window)
//   node scripts/registry-installation-key.mjs --env-file .env.external --revoke-previous   after restarting on the new key, revoke the retiring one
// The private key is written to the env file (mode 600) and never printed; only fingerprints and the public key are shown.
import { generateKeyPairSync, createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { createRegistryClient } from '../apps/api/src/services/website-registry-client.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const file = args.find((a) => a.startsWith('--env-file='))?.slice(11) ?? (flag('--env-file') ? args[args.indexOf('--env-file') + 1] : null)
if (!file || !existsSync(file)) { console.error('Usage: node scripts/registry-installation-key.mjs --env-file <existing env file> [--rotate | --revoke-previous] [--grace-seconds=N]'); process.exit(2) }
const text = readFileSync(file, 'utf8')
const value = (key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
const fingerprint = (publicKey) => createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('hex').slice(0, 16)
const newPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return { seed: privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32).toString('base64url'), publicKey: publicKey.export({ format: 'jwk' }).x }
}
// Atomic replace so a crash never leaves a half-written secret file.
const writeEnv = (next) => { const temp = `${file}.${process.pid}.tmp`; writeFileSync(temp, next, { mode: 0o600 }); try { chmodSync(temp, 0o600) } catch { /* not supported on this platform */ } renameSync(temp, file) }
const setKey = (seed) => /^RUNLY_INSTALLATION_PRIVATE_KEY=.*$/m.test(text) ? text.replace(/^RUNLY_INSTALLATION_PRIVATE_KEY=.*$/m, () => `RUNLY_INSTALLATION_PRIVATE_KEY=${seed}`) : `${text.trimEnd()}\nRUNLY_INSTALLATION_PRIVATE_KEY=${seed}\n`

function clientFromFile() {
  const baseUrl = value('RUNLY_REGISTRY_URL'), installationId = value('RUNLY_INSTALLATION_ID'), privateKey = value('RUNLY_INSTALLATION_PRIVATE_KEY')
  if (!baseUrl || !installationId || !privateKey) { console.error('RUNLY_REGISTRY_URL, RUNLY_INSTALLATION_ID and RUNLY_INSTALLATION_PRIVATE_KEY must be set.'); process.exit(1) }
  return createRegistryClient({ baseUrl, installationId, privateKey })
}

if (flag('--rotate')) {
  const client = clientFromFile(), pair = newPair()
  const grace = Number(args.find((a) => a.startsWith('--grace-seconds='))?.slice(16)) || undefined
  // The registry must accept the new public key before the file changes: an unreachable registry changes nothing.
  const result = await client.rotateKey(pair.publicKey, grace)
  writeEnv(setKey(pair.seed))
  console.log(`Rotated. New key ${result.fingerprint} written to the env file (not shown). Restart the API on the new key.`)
  console.log(`The previous key stays valid until ${result.previousKeyValidUntil ?? 'its grace window ends'}; then run with --revoke-previous.`)
} else if (flag('--revoke-previous')) {
  const client = clientFromFile()
  const retiring = (await client.keys()).filter((key) => key.status === 'retiring')
  for (const key of retiring) await client.revokeKey(key.id)
  console.log(`Revoked ${retiring.length} retiring key(s).`)
} else {
  if (/^RUNLY_INSTALLATION_PRIVATE_KEY=.+$/m.test(text)) { console.error('RUNLY_INSTALLATION_PRIVATE_KEY already has a value; use --rotate. Refusing to replace it.'); process.exit(1) }
  const pair = newPair()
  writeEnv(setKey(pair.seed))
  console.log('Private key written to the env file (not shown).')
  console.log(`Public key for enrollment: ${pair.publicKey}`)
  console.log(`Fingerprint: ${fingerprint(pair.publicKey)}`)
}
