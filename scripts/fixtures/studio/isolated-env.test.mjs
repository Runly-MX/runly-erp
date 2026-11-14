import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { isolatedEnv } from './isolated-env.mjs'

const local = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5000/postgres', DIRECT_URL: 'postgresql://u:p@127.0.0.1:5000/postgres', SUPABASE_URL: 'http://supabase-kong:8000' }

test('isolated env blanks every name of the .env files, drops the rest of process.env and keeps overrides', () => {
  const root = mkdtempSync(join(tmpdir(), 'isolated-env-'))
  try {
    writeFileSync(join(root, '.env'), 'GROQ_API_KEY=sentinel-secret\nexport SMTP_HOST=smtp.example.test\n# COMMENT=1\nDATABASE_URL=postgresql://remote.example.test/db\n')
    process.env.ISOLATED_ENV_TEST_ONLY = 'must-not-leak'
    const env = isolatedEnv({ ...local, RUNLY_API_PORT: '1234' }, { root })
    assert.equal(env.GROQ_API_KEY, ''); assert.equal(env.SMTP_HOST, ''); assert.equal('COMMENT' in env, false)
    assert.equal(env.DATABASE_URL, local.DATABASE_URL, 'override wins over the .env name'); assert.equal(env.RUNLY_API_PORT, '1234')
    assert.equal('ISOLATED_ENV_TEST_ONLY' in env, false); assert.ok(!JSON.stringify(env).includes('sentinel-secret'))
  } finally { delete process.env.ISOLATED_ENV_TEST_ONLY; rmSync(root, { recursive: true, force: true }) }
})

test('isolated env refuses remote or missing destinations', () => {
  assert.throws(() => isolatedEnv({ ...local, DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres' }), /REMOTE_DESTINATION_DATABASE_URL/)
  assert.throws(() => isolatedEnv({ ...local, SUPABASE_URL: 'https://project.supabase.example' }), /REMOTE_DESTINATION_SUPABASE_URL/)
  assert.throws(() => isolatedEnv({ DIRECT_URL: local.DIRECT_URL }), /DESTINATIONS_REQUIRED/)
})
