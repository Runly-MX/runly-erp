import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareMigrationHistory, inspectDeployment } from '../../prisma/deployment-preflight.mjs';
const hash = sql => createHash('sha256').update(sql).digest('hex');

test('preflight detects pending/failed/unknown/modified migrations and tolerates line endings', () => {
  const file = { name: '001', sql: 'SELECT 1;\r\n' };
  const applied = { migration_name: '001', checksum: hash('SELECT 1;\n'), finished: true, rolled_back: false };
  assert.equal(compareMigrationHistory([file], [applied]).ready, true);
  const report = compareMigrationHistory([file, { name: '002', sql: 'SELECT 2;' }], [
    { ...applied, checksum: hash('SELECT 3;\n') }, { migration_name: '003', finished: true }, { migration_name: '004', finished: false },
  ]);
  assert.equal(report.ready, false);
  assert.deepEqual(report.pending, ['002']); assert.deepEqual(report.failed, ['004']);
  assert.deepEqual(report.unknownApplied, ['003']); assert.deepEqual(report.checksumMismatches, ['001']);
});
test('preflight refuses missing configuration and rolls back failed read-only inspection', async () => {
  await assert.rejects(inspectDeployment({}), { code: 'DATABASE_CONFIGURATION_REQUIRED' });
  const statements = [];
  class FakeClient {
    async connect() {}
    async query(sql) { statements.push(sql); if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') throw new Error('fixture failure'); return { rows: [] }; }
    async end() { statements.push('END'); }
  }
  await assert.rejects(inspectDeployment({ connectionString: 'fixture', Client: FakeClient }));
  assert.equal(statements[0], 'BEGIN READ ONLY');
  assert.deepEqual(statements.slice(-2), ['ROLLBACK', 'END']);
  assert.ok(statements.every(sql => sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK' || sql === 'END' || sql.startsWith('SELECT ')));
});
