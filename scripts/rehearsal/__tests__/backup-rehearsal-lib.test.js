import test from 'node:test'
import assert from 'node:assert/strict'
import { assessRecoverable, classifyConfig } from '../lib/recoverable.mjs'
import { auditGate, isRelevantFinding } from '../lib/audit-data.mjs'
import { NEUTRALIZATION_STEPS, reviewedFrom } from '../lib/neutralize.mjs'
import { reachable, startIfIsolated } from '../lib/isolation.mjs'

const good = () => ({
  credentials: { ok: true }, repository: { ok: true }, snapshot: { found: true, coverage: 'complete-declared', pending: false },
  extraction: { ok: true }, assessment: { exitCode: 0, hashMismatches: 0, missingFiles: 0 },
  restore: { ran: true, unexpectedErrors: 0 }, comparison: { differences: 0 }, objects: { mismatches: 0, unreadable: 0 },
})

test('a backup is recoverable only when every piece of evidence is present and clean', () => {
  assert.deepEqual(assessRecoverable(good()), { recoverable: true, reasons: [] })
})

test('every kind of failure, and any missing evidence, makes the verdict negative', () => {
  const broken = {
    'wrong credential': e => { e.credentials.ok = false },
    'integrity failure': e => { e.repository.ok = false },
    'no snapshot': e => { e.snapshot = { found: false } },
    'database-only snapshot': e => { e.snapshot.coverage = 'database-only' },
    'legacy snapshot': e => { e.snapshot.coverage = 'legacy-unknown' },
    'pending snapshot': e => { e.snapshot.pending = true },
    'interrupted extraction': e => { e.extraction.ok = false },
    'altered file': e => { e.assessment.hashMismatches = 1 },
    'missing file': e => { e.assessment.missingFiles = 1 },
    'assessment says incomplete': e => { e.assessment.exitCode = 3 },
    'partial restore': e => { e.restore.unexpectedErrors = 4 },
    'restore not run': e => { e.restore.ran = false },
    'inventory differs': e => { e.comparison.differences = 2 },
    'missing object': e => { e.objects.unreadable = 1 },
    'object differs': e => { e.objects.mismatches = 1 },
  }
  for (const [name, mutate] of Object.entries(broken)) {
    const evidence = good(); mutate(evidence)
    assert.equal(assessRecoverable(evidence).recoverable, false, name)
  }
  assert.equal(assessRecoverable({}).recoverable, false, 'no evidence at all')
  for (const part of Object.keys(good())) {
    const evidence = good(); delete evidence[part]
    assert.equal(assessRecoverable(evidence).recoverable, false, `missing ${part}`)
  }
})

test('a configuration copy is classified as redacted or integral without printing values', () => {
  assert.equal(classifyConfig('RUNLY_API_PORT=4010\nLIVEKIT_MODE=disabled\nJWT_SECRET=\nDATABASE_URL=\n'), 'redacted')
  assert.equal(classifyConfig('RUNLY_API_PORT=4010\nJWT_SECRET=abc123\n'), 'integral')
  assert.equal(classifyConfig('DATABASE_URL=postgresql://u:p@db/x\n'), 'integral')
  assert.equal(classifyConfig(''), 'empty')
})

const finding = overrides => ({ table: 't', column: 'c', type: 'text', populated: 1, urlRows: 0, externalHostRows: 0, emailRows: 0, secrets: {}, sensitiveName: false, encryptedName: false, ...overrides })

test('the audit gate blocks active capabilities and unreviewed findings, and accepts reviewed ones', () => {
  const audit = { capabilities: [{ id: 'automations-enabled', table: 'system_automation', count: 2 }, { id: 'fcm-tokens-enabled', table: 'fcm_device_token', count: 0 }],
    findings: [finding({ table: 'hooks', column: 'callback_url', externalHostRows: 1 }), finding({ table: 'push_subscription', column: 'endpoint', sensitiveName: true, externalHostRows: 1 }), finding({ table: 'people', column: 'email', emailRows: 5 })] }
  const gate = auditGate(audit, { reviewed: reviewedFrom(NEUTRALIZATION_STEPS) })
  assert.equal(gate.pass, false)
  assert.deepEqual(gate.blocking.map(b => b.kind === 'active-capability' ? b.id : `${b.table}.${b.column}`).sort(), ['automations-enabled', 'hooks.callback_url'])
  assert.deepEqual(gate.acknowledged.map(a => a.key), ['push_subscription.endpoint'])
  const clean = auditGate({ capabilities: audit.capabilities.map(c => ({ ...c, count: 0 })), findings: [finding({ table: 'push_subscription', column: 'endpoint', sensitiveName: true, externalHostRows: 1 })] }, { reviewed: reviewedFrom(NEUTRALIZATION_STEPS) })
  assert.equal(clean.pass, true)
})

test('e-mail addresses alone and opaque ciphertext do not block, cleartext credentials do', () => {
  assert.equal(isRelevantFinding(finding({ emailRows: 9 })), false)
  assert.equal(isRelevantFinding(finding({ column: 'access_token_encrypted', sensitiveName: true, encryptedName: true })), false)
  assert.equal(isRelevantFinding(finding({ secrets: { 'api-key': 1 } })), true)
  assert.equal(isRelevantFinding(finding({ column: 'token', sensitiveName: true })), true)
})

test('API and Worker are never started when the isolation check fails', async () => {
  let started = 0
  await assert.rejects(startIfIsolated(async () => { throw Error('ISOLATION_NOT_VERIFIED: internet') }, () => { started += 1 }), /ISOLATION_NOT_VERIFIED/)
  assert.equal(started, 0)
  assert.equal(await startIfIsolated(async () => ({ internal: true }), proof => (started += 1, proof.internal)), true)
  assert.equal(started, 1)
  assert.deepEqual(reachable({ internet: false, dns: true, 'host-service': false }), ['dns'])
})

import { missingRoleStatements, exposesPasswords } from '../lib/roles.mjs'

const rolesSql = `--
-- Roles
--

CREATE ROLE anon;
ALTER ROLE anon WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE runly_rehearsal_login;
ALTER ROLE runly_rehearsal_login WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;
CREATE ROLE runly_rehearsal_reader;
ALTER ROLE runly_rehearsal_reader WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;
GRANT anon TO authenticator WITH INHERIT FALSE GRANTED BY postgres;
GRANT runly_rehearsal_reader TO runly_rehearsal_login WITH INHERIT TRUE GRANTED BY postgres;
`

test('only roles missing from the replica are created, and existing roles are never touched', () => {
  const { missing, statements } = missingRoleStatements(rolesSql, ['anon', 'authenticator', 'postgres'])
  assert.deepEqual(missing.sort(), ['runly_rehearsal_login', 'runly_rehearsal_reader'])
  assert.equal(statements.length, 5)
  assert.ok(statements.every(statement => !/\banon\b/.test(statement)))
  assert.ok(statements.some(statement => statement.startsWith('GRANT runly_rehearsal_reader TO runly_rehearsal_login')))
  assert.deepEqual(missingRoleStatements(rolesSql, ['anon', 'authenticator', 'postgres', 'runly_rehearsal_login', 'runly_rehearsal_reader']).statements, [])
})

test('a role dump with a password clause is detected', () => {
  assert.equal(exposesPasswords(rolesSql), false)
  assert.equal(exposesPasswords("ALTER ROLE x WITH LOGIN PASSWORD 'SCRAM-SHA-256$4096:abc';"), true)
})

import { resetDefaultPrivilegesStatements } from '../lib/privileges.mjs'

test('default privileges of the destination are cleared with one REVOKE per creator, schema and object type', () => {
  const statements = resetDefaultPrivilegesStatements([
    { creator: 'postgres', schema: 'public', type: 'r', grantees: ['anon', 'authenticated', 'postgres', 'service_role', 'anon'] },
    { creator: 'supabase_admin', schema: null, type: 'f', grantees: ['PUBLIC'] },
    { creator: 'postgres', schema: 'public', type: 'x', grantees: ['anon'] },
    { creator: 'postgres', schema: 'storage', type: 'S', grantees: [] },
  ])
  assert.deepEqual(statements, [
    'ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon", "authenticated", "postgres", "service_role"',
    'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" REVOKE ALL ON FUNCTIONS FROM PUBLIC',
  ])
})
