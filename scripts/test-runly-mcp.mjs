import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';

const require = createRequire(import.meta.url);
const name = `runly-mcp-test-${process.pid}`;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Falló ${command}`);
  return result.stdout?.trim() ?? '';
}
let created = false;
try {
  run('docker', ['run', '--rm', '--detach', '--name', name, '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=runly_mcp_test', '--tmpfs', '/var/lib/postgresql', 'postgres:18-alpine']);
  created = true;
  const port = run('docker', ['port', name, '5432/tcp']).split(':').at(-1);
  if (!/^\d+$/.test(port)) throw new Error('Puerto de pruebas inválido.');
  const url = `postgresql://postgres@127.0.0.1:${port}/runly_mcp_test`;
  for (let attempt = 0; ; attempt++) {
    const db = new pg.Client({ connectionString: url });
    try { await db.connect(); await db.query('CREATE ROLE anon; CREATE ROLE authenticated'); break; }
    catch (error) { if (attempt >= 30) throw error; await setTimeout(500); }
    finally { await db.end().catch(() => {}); }
  }
  const env = { ...process.env, DIRECT_URL: url, DATABASE_URL: url, RUNLY_MCP_TEST_DATABASE_URL: url };
  // New empty tmpfs database only. Never points at the workspace .env database.
  run(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--url', url], { env, stdio: 'inherit' });
  const tests = spawnSync(process.execPath, ['--test', 'apps/api/src/mcp/__tests__/config.test.js', 'apps/api/src/mcp/__tests__/oauth.test.js', 'apps/api/src/mcp/__tests__/domain-contracts.test.js', 'apps/api/src/mcp/__tests__/file-import.test.js', 'apps/api/src/mcp/__tests__/mcp.integration.test.js'], { env, stdio: 'inherit' });
  process.exitCode = tests.status ?? 1;
} finally {
  if (created) run('docker', ['stop', name]);
}
