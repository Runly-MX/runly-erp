// Read-only inspection. Never invokes Prisma migrate, seed or schema sync.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export function compareMigrationHistory(files, history) {
  const applied = new Map(history.filter(row => row.finished && !row.rolled_back).map(row => [row.migration_name, row]));
  const local = new Set(files.map(file => file.name));
  const checksumMismatches = files.filter(file => {
    if (!applied.has(file.name)) return false;
    const variants = [file.sql, file.sql.replaceAll('\r\n', '\n'), file.sql.replace(/\r?\n/g, '\r\n')];
    return !variants.some(text => createHash('sha256').update(text).digest('hex') === applied.get(file.name).checksum);
  }).map(file => file.name);
  const result = { localMigrations: files.length, appliedMigrations: applied.size,
    pending: files.filter(file => !applied.has(file.name)).map(file => file.name),
    failed: history.filter(row => !row.finished && !row.rolled_back).map(row => row.migration_name),
    unknownApplied: [...applied.keys()].filter(name => !local.has(name)), checksumMismatches };
  return { ...result, ready: ![result.pending, result.failed, result.unknownApplied, checksumMismatches].some(list => list.length) };
}

export async function inspectDeployment({ connectionString, migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url)), Client = pg.Client }) {
  if (!connectionString) throw Object.assign(new Error('DATABASE_CONFIGURATION_REQUIRED'), { code: 'DATABASE_CONFIGURATION_REQUIRED' });
  const client = new Client({ connectionString, connectionTimeoutMillis: 8000, statement_timeout: 10000, application_name: 'runly-readonly-preflight' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const entries = (await readdir(migrationsDirectory, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = await Promise.all(entries.map(async entry => ({ name: entry.name, sql: await readFile(join(migrationsDirectory, entry.name, 'migration.sql'), 'utf8') })));
    const history = await client.query('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY migration_name');
    const state = await client.query("SELECT current_setting('server_version') AS postgres, current_setting('transaction_read_only') AS read_only, to_regclass('public.studio_design') IS NOT NULL AS studio_table");
    const modules = await client.query("SELECT key, enabled, status FROM runly_module WHERE key IN ('runly.studio', 'runly.automations', 'runly.documents') ORDER BY key");
    const permissions = await client.query("SELECT key, active FROM permission WHERE key IN ('studio.view', 'studio.create', 'studio.edit') ORDER BY key");
    const comparison = compareMigrationHistory(files, history.rows);
    return { mode: 'read-only', ...state.rows[0], ...comparison, modules: modules.rows, studioPermissions: permissions.rows,
      studioCatalogReady: modules.rows.some(module => module.key === 'runly.studio' && module.enabled && module.status === 'INSTALLED') && permissions.rows.length === 3 && permissions.rows.every(permission => permission.active) };
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* connection may have failed */ }
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await inspectDeployment({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ready && result.studio_table && result.studioCatalogReady ? 0 : 2;
  } catch (error) {
    // Do not print a connection string, endpoint or driver error containing credentials.
    console.error(JSON.stringify({ mode: 'read-only', ready: false, code: error.code || 'PREFLIGHT_FAILED' }));
    process.exitCode = 1;
  }
}
