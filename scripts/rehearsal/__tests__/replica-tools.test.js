import test from 'node:test'
import assert from 'node:assert/strict'
import { checkReplicaEnv, parseEnv, NEUTRALIZING_OVERRIDES } from '../lib/replica-guard.mjs'
import { diffInventories } from '../lib/inventory.mjs'

test('the guard flags external hosts and real credentials by name and never echoes values', () => {
  const secret = 'sk-live-do-not-print'
  const findings = checkReplicaEnv(parseEnv(`GROQ_API_KEY=${secret}\nSUPABASE_URL=https://prod.example-company.com\nDATABASE_URL=postgresql://u:p@supabase-db:5432/postgres\nBACKUP_MODE=enabled\nRUNLY_APP_URL=http://127.0.0.1:5173\nSMTP_HOST=smtp.provider.com\n`))
  assert.deepEqual(findings.map(f => f.name).sort(), ['BACKUP_MODE', 'GROQ_API_KEY', 'SMTP_HOST', 'SUPABASE_URL'])
  assert.equal(JSON.stringify(findings).includes(secret), false)
})

test('a neutralized replica environment passes', () => {
  const lines = Object.entries(NEUTRALIZING_OVERRIDES).map(([k, v]) => `${k}=${v}`).concat(['SUPABASE_URL=http://supabase-kong:8000', 'RUNLY_API_URL=http://localhost:4010', 'DATABASE_URL=postgresql://postgres:x@host.docker.internal:5433/postgres'])
  assert.deepEqual(checkReplicaEnv(parseEnv(lines.join('\n'))), [])
})

const inventory = () => ({
  server: '17.6', semantic: { grants: 'g1', memberships: 'm1', identities: 'i1' }, migrations: [{ name: 'a', finished: true, rolled_back: false }], modules: [{ key: 'x' }],
  tables: { notes: { rows: 2, digest: 'd1' } }, storage: { buckets: [{ id: 'runly-notes', public: true }], objects: { 'runly-notes/a.png': { size: 3, sha256: 'h1' } } },
  protections: { notesPolicy: 0, notesGuard: 0, notesBucketsPrivate: false }, externalReach: { tables: [], instanceConfigKeys: [] },
})

test('inventory diff reports every unexpected change and tolerates declared ones', () => {
  const before = inventory(), after = inventory()
  assert.deepEqual(diffInventories(before, after), [])
  after.tables.notes.digest = 'd2'; after.storage.objects['runly-notes/a.png'].sha256 = 'h2'; after.migrations.push({ name: 'b', finished: true, rolled_back: false })
  after.storage.buckets[0].public = false; after.protections = { notesPolicy: 1, notesGuard: 1, notesBucketsPrivate: true }
  const sections = diffInventories(before, after).map(d => d.section)
  assert.deepEqual(sections.sort(), ['buckets', 'migrations-added', 'objects', 'protections', 'tables:notes'])
  assert.deepEqual(diffInventories(before, after, { allow: ['buckets', 'migrations-added', 'protections'] }).map(d => d.section).sort(), ['objects', 'tables:notes'])
  const regranted = inventory(); regranted.semantic.grants = 'g2'
  assert.equal(diffInventories(before, regranted)[0].section, 'semantic:grants')
  const reverted = inventory(); reverted.migrations = []
  assert.equal(diffInventories(before, reverted)[0].section, 'migrations')
})
