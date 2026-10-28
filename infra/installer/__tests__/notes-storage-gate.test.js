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
