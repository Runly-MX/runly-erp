import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareExternalStudioRealtime } from '../lib/studio-realtime-external.mjs'

test('external owner credentials are isolated from the Prisma job; diagnosis never loads them', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-external-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  mkdirSync(join(cwd, '.secrets'))
  mkdirSync(join(cwd, 'supabase/volumes/db'), { recursive: true })
  writeFileSync(join(cwd, 'supabase/volumes/db/studio-realtime-role.sql'), 'SELECT 1;')
  const admin = join(cwd, '.secrets/studio-admin.env')
  writeFileSync(admin, 'SUPABASE_ADMIN_DATABASE_URL=postgresql://owner:secret@database.example/postgres\n')
  const calls = [], spawn = (command, args, options) => { calls.push({ command, args, options }); return { status: 0, stdout: '', stderr: '' } }
  const options = { cwd, image: 'example/api:test', envFile: join(cwd, '.env.external'), spawn }
  prepareExternalStudioRealtime({ ...options, recover: true })
  assert.equal(calls.length, 2)
  assert.ok(calls[0].args.includes(admin))
  assert.equal(calls[1].args.includes(admin), false)
  assert.ok(calls[1].args.includes('--rolled-back'))
  assert.equal(calls.some(call => call.args.some(arg => arg.includes('secret@'))), false)
  calls.length = 0
  prepareExternalStudioRealtime({ ...options, diagnose: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args.includes(admin), false)
  writeFileSync(admin, 'DATABASE_URL=postgresql://wrong.example/postgres\n')
  assert.throws(() => prepareExternalStudioRealtime(options), /STUDIO_ADMIN_FILE_INVALID/)
  assert.equal(calls.length, 1)
})

test('failed external preflight does not resolve history or disclose driver errors', () => {
  assert.throws(() => prepareExternalStudioRealtime({ cwd: '.', image: '--bad' }), /EXPLICIT_API_IMAGE_REQUIRED/)
  assert.throws(() => prepareExternalStudioRealtime({ cwd: 'infra/installer', envFile: '.env.external', image: 'example/api:test', spawn: () => ({ status: 1, stderr: 'password=private' }), recover: true }), error => error.message === 'STUDIO_DATABASE_CHECK_FAILED')
})
