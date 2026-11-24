// The probe's parsing and verdicts with a fake docker; the real daemon is
// exercised by scripts/security/verify-container-profile.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyHardeningProfile } from '../../../api/src/secure-runtime/isolated/profile-check.js'

const IMAGE = `node:22-alpine@sha256:${'a'.repeat(64)}`
const GOOD = { uid: '65534', capeff: '0000000000000000', capbnd: '0000000000000000', rootro: '1', nnp: '1', seccomp: '2', pids: '64', mem: String(128 * 1024 * 1024), nics: 'lo,', rootWritable: '0', sockets: '0', unshare: '0', mount: '0', tmpExec: '0', env: '0' }
const fake = (overrides, code = 0) => async () => ({ code, stdout: Object.entries({ ...GOOD, ...overrides }).map(([k, v]) => `${k}=${v}`).join('\n'), stderr: '' })

test('an enforced profile passes', async () => assert.deepEqual(await verifyHardeningProfile({ image: IMAGE, run: fake({}) }), { ok: true, failed: [], checks: { ...GOOD } }))

test('each weakening is reported by name', async () => {
  const cases = { 'non-root-user': { uid: '0' }, 'capabilities-dropped': { capbnd: '00000000a80425fb' }, 'no-new-privileges': { nnp: '0' }, 'seccomp-filter': { seccomp: '0' }, 'pids-limit': { pids: 'max' }, 'memory-limit': { mem: 'max' }, 'no-network': { nics: 'lo,eth0,' }, 'read-only-root': { rootro: '0' }, 'no-docker-socket': { sockets: '1' }, 'namespaces-blocked': { unshare: '1' }, 'mount-blocked': { mount: '1' }, 'tmp-noexec': { tmpExec: '1' }, 'clean-environment': { env: '2' } }
  for (const [name, change] of Object.entries(cases)) assert.deepEqual((await verifyHardeningProfile({ image: IMAGE, run: fake(change) })).failed, [name], name)
})

test('an image not pinned by digest, or a probe that cannot run, is not accepted', async () => {
  assert.ok((await verifyHardeningProfile({ image: 'node:22-alpine', run: fake({}) })).failed.includes('image-not-pinned-by-digest'))
  assert.equal((await verifyHardeningProfile({ image: IMAGE, run: fake({}, 125) })).ok, false)
})
