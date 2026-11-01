import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

// Explicitly creates and owns its database. No env fallback, bind mount, pull,
// deployment target, existing container or production configuration is used.
const name = `runly-commerce-p1-${process.pid}-${Date.now()}`;
const image = 'postgres:18-alpine';
const scratch = mkdtempSync(join(tmpdir(), 'runly-commerce-p1-'));
const root = resolve(import.meta.dirname, '..');
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
let created = false;
try {
  run('docker', ['image','inspect',image,'--format','{{.Id}}']);
  run('docker', ['run','--pull=never','--rm','-d','--name',name,'--label','runly.commerce-test=true',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=commerce_test','-p','127.0.0.1::5432','--tmpfs','/var/lib/postgresql',image]);
  created = true;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnSync('docker',['exec',name,'pg_isready','-U','postgres','-d','commerce_test'],{stdio:'ignore'}).status === 0) break;
    if (attempt === 99) throw new Error('PostgreSQL local no inició.');
    await delay(100);
  }
  const port = run('docker',['port',name,'5432']).trim().split(':').at(-1);
  const testUrl = `postgresql://postgres@127.0.0.1:${port}/commerce_test`;
  const env = { ...process.env, DIRECT_URL: testUrl, RUNLY_COMMERCE_TEST_DATABASE_URL: testUrl };
  const baselineSchema = join(scratch,'baseline.prisma');
  const baselineSql = join(scratch,'baseline.sql');
  writeFileSync(baselineSchema,run('git',['show','1fd80f5d1:prisma/schema.prisma']));
  const prismaCli = resolve(root,'node_modules/prisma/build/index.js');
  run(process.execPath,[prismaCli,'migrate','diff','--from-empty','--to-schema',baselineSchema,'--script','--output',baselineSql],{env});
  const migration = resolve(root,'prisma/migrations/20261101120000_commerce_recovery_integrity/migration.sql');
  const apply = (file, database = 'commerce_test') => {
    run('docker',['cp',file,`${name}:/tmp/commerce.sql`]);
    return run('docker',['exec',name,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-q','-f','/tmp/commerce.sql']);
  };
  const sql = (statement, database = 'commerce_test') => run('docker',['exec',name,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',statement]);
  apply(baselineSql);
  sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO anon,authenticated');
  sql(`INSERT INTO pos_order (company_id,outlet_id,order_number,status,total_amount,paid_amount,created_by_id,updated_at)
    VALUES (uuidv7(),uuidv7(),1,'PAID',50,50,uuidv7(),now())`);
  apply(migration);
  assert.equal(sql(`SELECT count(*) FROM pos_order WHERE currency IS NULL AND tax_snapshot IS NULL AND experience IS NULL
    AND stock_status='LEGACY_UNKNOWN' AND version=1 AND paid_amount=50 AND total_amount=50`).trim(),'1');
  assert.equal(sql('SELECT count(*) FROM pos_refund').trim(),'0');
  assert.equal(sql(`SELECT count(*) FROM pos_payment WHERE tendered_amount IS NOT NULL OR change_amount IS NOT NULL`).trim(),'0');
  assert.equal(sql(`SELECT has_table_privilege('authenticated','pos_refund','SELECT') OR has_table_privilege('anon','pos_command','INSERT')`).trim(),'f');
  assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname IN ('pos_command','pos_refund','pos_refund_line','pos_refund_payment') AND relrowsecurity`).trim(),'4');
  console.log('PASS migration: additive schema preserves historic amounts and unknown currency; no fabricated refunds.');
  console.log('PASS migration: new financial tables enable RLS and revoke inherited public-client grants.');
  // Match the legacy NOT VALID money-container rule omitted by Prisma's datamodel diff.
  sql(`ALTER TABLE pos_payment ADD CONSTRAINT pos_payment_money_container_check CHECK(num_nonnulls(session_id,waiter_shift_id)=1) NOT VALID`);

  sql('CREATE DATABASE commerce_preflight');
  apply(baselineSql,'commerce_preflight');
  sql(`WITH outlet AS (INSERT INTO pos_outlet(company_id,name,updated_at) VALUES(uuidv7(),'Fixture',now()) RETURNING *),
    terminal AS (INSERT INTO pos_terminal(company_id,outlet_id,name,updated_at) SELECT company_id,id,'Fixture',now() FROM outlet RETURNING *)
    INSERT INTO pos_session(company_id,outlet_id,terminal_id,opened_by_id)
    SELECT company_id,outlet_id,id,uuidv7() FROM terminal CROSS JOIN generate_series(1,2)`,'commerce_preflight');
  run('docker',['cp',migration,`${name}:/tmp/preflight.sql`]);
  const blocked = spawnSync('docker',['exec',name,'psql','-U','postgres','-d','commerce_preflight','-v','ON_ERROR_STOP=1','-q','-f','/tmp/preflight.sql'],{encoding:'utf8'});
  assert.notEqual(blocked.status,0);
  assert.match(blocked.stderr,/duplicate OPEN containers/);
  assert.equal(sql(`SELECT to_regclass('public.pos_command') IS NULL`,'commerce_preflight').trim(),'t');
  assert.equal(sql(`SELECT count(*) FROM pos_session WHERE status='OPEN'`,'commerce_preflight').trim(),'2');
  console.log('PASS migration: duplicate OPEN containers abort before DDL and preserve both historical rows.');

  const files = ['apps/api/src/routes/pos/__tests__','apps/api/src/routes/catalog/__tests__']
    .flatMap((folder) => readdirSync(resolve(root,folder)).filter((f)=>f.endsWith('.test.js')).map((f)=>`${folder}/${f}`));
  files.push('apps/api/src/manifests/official/__tests__/runly-pos-contract.test.js',
    'apps/api/src/routes/__tests__/commerce-sync-guard.test.js','apps/api/src/services/__tests__/sync-push-service.test.js',
    'packages/sdk/src/__tests__/pos-recovery.test.js',
    'apps/desktop/src/modules/runly.pos/lib/plannerObjects.test.js','apps/desktop/src/modules/runly.pos/lib/floorObjects.test.js');
  const result=spawnSync(process.execPath,['--test','--test-reporter=spec',...files],{cwd:root,env,stdio:'inherit'});
  if(result.status!==0)throw new Error('Falló la suite Commerce.');
} finally {
  if(created){
    const label=run('docker',['inspect',name,'--format','{{index .Config.Labels "runly.commerce-test"}}']).trim();
    if(label==='true')run('docker',['stop','--time','2',name]);
  }
  // Only this process's mkdtemp directory is removed.
  assert.ok(scratch.startsWith(join(tmpdir(),'runly-commerce-p1-')));
  rmSync(scratch,{recursive:true,force:true});
}
