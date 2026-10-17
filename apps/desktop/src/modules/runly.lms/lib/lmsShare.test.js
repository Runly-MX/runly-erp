import { test } from 'node:test'
import assert from 'node:assert/strict'
import { absoluteShareUrl, promoLessonOptions, readGuestToken, validateJoinForm, writeGuestToken } from './lmsShare.js'

function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }
}

test('guest token is stored per share token and cleared with null', () => {
  const storage = memoryStorage()
  writeGuestToken('a', 'tok-a', storage)
  writeGuestToken('b', 'tok-b', storage)
  assert.equal(readGuestToken('a', storage), 'tok-a')
  writeGuestToken('a', null, storage)
  assert.equal(readGuestToken('a', storage), null)
  assert.equal(readGuestToken('b', storage), 'tok-b')
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readGuestToken('a', broken), null)
  assert.doesNotThrow(() => writeGuestToken('a', 'x', broken))
})

test('join form validation mirrors the API', () => {
  assert.deepEqual(validateJoinForm({ name: '  Ana  Ruiz ', email: '' }), { values: { name: 'Ana Ruiz' }, errors: {} })
  assert.ok(validateJoinForm({ name: 'A' }).errors.name)
  assert.ok(validateJoinForm({ name: 'Ana', email: 'nope' }).errors.email)
})

test('share url and promo options', () => {
  assert.equal(absoluteShareUrl({ path: '/app/p/lms/curso/x' }, 'https://erp.example.com'), 'https://erp.example.com/app/p/lms/curso/x')
  assert.equal(absoluteShareUrl({ url: 'https://a.example.com/app/p/lms/curso/x' }, 'https://b'), 'https://a.example.com/app/p/lms/curso/x')
  const options = promoLessonOptions([
    { title: 'Intro', free: true, lessons: [{ id: '1', kind: 'video', title: 'Hola' }, { id: '2', kind: 'text', title: 'Texto' }] },
    { title: 'Dos', free: false, lessons: [{ id: '3', kind: 'embed', title: 'YT', preview: true }, { id: '4', kind: 'video', title: 'Privado' }] },
  ])
  assert.deepEqual(options.map((o) => o.value), ['none', '1', '3'])
})
