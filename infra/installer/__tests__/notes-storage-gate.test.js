import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareAndVerifyNotesStorage, probeNotesStorage, NOTES_STORAGE_NOT_PREPARED } from '../lib/notes-storage-gate.mjs'

const base = ['run', '--rm', '--env-file', '.env.local']

test('fails closed when verification fails and no owner is available', () => {
  const calls = []
  assert.throws(() => prepareAndVerifyNotesStorage({ run: (c, args) => { calls.push(args); if (args.includes('--verify')) throw Error('exit 1') }, dockerRunBase: base, image: 'img:1', log: () => {} }),
    (error) => error.message === NOTES_STORAGE_NOT_PREPARED)
  assert.equal(calls.length, 1)
})

test('owner connection travels through the environment, never through arguments', () => {
  const secret = 'postgresql://owner:s3cret@db/postgres'
  const seen = []
  prepareAndVerifyNotesStorage({ run: (c, args, options) => seen.push({ args, options }), dockerRunBase: base, image: 'img:1', ownerUrl: secret, log: () => {} })
  assert.equal(seen.length, 2)
  assert.ok(seen.every(({ args }) => !args.join(' ').includes('s3cret')))
  assert.equal(seen[0].options.env.RUNLY_NOTES_OWNER_DATABASE_URL, secret)
  assert.ok(seen[0].args.includes('--prepare-owner') && seen[1].args.includes('--verify'))
})

test('an anonymous read during the post-start probe fails the installation', () => {
  assert.throws(() => probeNotesStorage({ run: () => { throw Error('exit 1') }, dockerRunBase: base, image: 'img:1', log: () => {} }), /NOTES_STORAGE_ANONYMOUS_ACCESS/)
})

// The Notes Storage gate must run before any migration, seed or Studio provisioning:
// a failed preflight may not leave a half-updated application schema behind.
test('both installers run the Notes Storage gate before migrations and seed', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const file of ['setup-external.mjs', 'setup-local.mjs']) {
    const source = (await readFile(new URL(`../${file}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
    const gate = source.indexOf('prepareAndVerifyNotesStorage({')
    assert.ok(gate > 0, `${file}: gate call not found`)
    for (const later of ['"pnpm", "db:migrate"', '"pnpm", "db:seed"', 'prepareExternalStudioRealtime({ image: resolvedApiImage']) {
      const index = source.lastIndexOf(later)
      assert.ok(index > gate, `${file}: ${later} must come after the Notes Storage gate`)
    }
    assert.equal(source.split('prepareAndVerifyNotesStorage({').length - 1, 1, `${file}: the gate must run once per pass`)
  }
})
