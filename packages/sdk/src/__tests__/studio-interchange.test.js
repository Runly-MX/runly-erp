import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunlyClient } from '../index.js'

test('portable Studio pipeline preserves multipart, protocol, auth, company and cancellation', async () => {
  const calls = [], signal = new AbortController().signal
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => 'company', fetch: async (url, options) => {
    calls.push({ url, options }); return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  } })
  const file = new File(['package'], 'portable.runlystudio')
  await client.studio.packageContract('token', signal)
  await client.studio.inspectPackage(file, 'token', signal)
  await client.studio.preparePackageImport(file, { target: 'personal', name: 'Portable' }, 'token', signal)
  await client.studio.packageImportStatus('job/one', 'token', signal)
  await client.studio.packageImportAsset('job/one', 'asset/one', 'token', signal)
  await client.studio.confirmPackageImport('job/one', { digest: 'a'.repeat(64), acceptWarnings: true }, 'token', signal)
  await client.studio.cancelPackageImport('job/one', 'token', signal)
  await client.studio.recoverPackageImports('token', signal)
  await client.studio.exportPackage('template', 'id/one', { acknowledgeImageCopies: true }, 'token', signal)
  for (const { options } of calls) {
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.equal(options.headers['X-Runly-Company-Id'], 'company')
    assert.equal(options.signal, signal)
    if (options.method !== 'GET') assert.equal(options.headers['X-Runly-Studio-Protocol'], '3')
  }
  assert.equal(calls[2].options.body.get('file').type, 'application/vnd.runly.studio+zip')
  assert.deepEqual(JSON.parse(calls[2].options.body.get('options')), { target: 'personal', name: 'Portable' })
  assert.ok(!calls[2].options.headers['Content-Type'], 'Fetch chooses multipart boundary')
  assert.ok(calls[4].url.endsWith('/imports/job%2Fone/assets/asset%2Fone'))
  assert.ok(calls[8].url.endsWith('/templates/id%2Fone/export'))
})
