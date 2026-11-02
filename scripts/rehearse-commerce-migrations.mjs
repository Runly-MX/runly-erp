// Rehearses the Commerce migrations on a disposable, local PostgreSQL:
// backup -> fingerprint -> preflight -> migrate -> compare -> legacy-writer
// compatibility -> restore from the backup -> compare again.
//
//   node scripts/rehearse-commerce-migrations.mjs                 synthetic data on the pre-Commerce schema
//   node scripts/rehearse-commerce-migrations.mjs --dump FILE     a pg_dump (custom format or plain SQL) of an
//                                                                 ISOLATED COPY of the pilot database
//
// It never reads application env, never connects to anything but the container
// it creates, and removes the container at the end. With --dump the copy must
// already be at the schema level that the pilot runs today; the migrations
// applied are the ones listed in docs/.../commerce-release-readiness.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const dumpArg = argv.includes('--dump') ? resolve(argv[argv.indexOf('--dump') + 1] ?? '') : null;
if (dumpArg && !existsSync(dumpArg)) throw new Error(`No existe el respaldo ${dumpArg}`);
const BASELINE = '1fd80f5d1'; // last commit before the Commerce migrations
const MIGRATIONS = [
  '20261101120000_commerce_recovery_integrity',
  '20261101180000_commerce_catalog_stock',
  '20261101210000_catalog_write_integrity',
  '20261101230000_pos_receipt_print_jobs',
  '20261101233000_commerce_restaurant',
  // Not Commerce: another change in the same candidate, applied in the same order the pilot will receive it.
  '20261217120000_call_transcript_engine_vocabulary',
];
const image = 'postgres:18-alpine';
const name = `runly-commerce-rehearsal-${process.pid}-${Date.now()}`;
const scratch = mkdtempSync(join(tmpdir(), 'runly-rehearsal-'));
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });
const psqlArgs = (db) => ['exec', name, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (statement, db = 'rehearsal') => run('docker', [...psqlArgs(db), '-c', statement]).trim();
const applyFile = (file, db = 'rehearsal') => { run('docker', ['cp', file, `${name}:/tmp/apply.sql`]); return run('docker', [...psqlArgs(db), '-q', '-f', '/tmp/apply.sql']); };
const steps = [];
const record = (step, ok, detail = '') => { steps.push({ step, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`); };
let created = false;
// Child processes get a minimal environment: nothing from the operator's shell or from a repository .env
// (prisma.config.ts and prisma/seed.js import dotenv) can point them at a real database.
const noEnvFile = join(scratch, 'no.env');
const baseEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
const safeEnv = (db) => ({ ...baseEnv, DATABASE_URL: db, DIRECT_URL: db, DOTENV_CONFIG_PATH: noEnvFile });
const assertLocal = (db) => { if (!['127.0.0.1', 'localhost'].includes(new URL(db).hostname)) throw new Error('El ensayo solo se conecta a su contenedor local.'); return db; };

// Row fingerprint per table over a fixed column list (so new columns do not count).
function fingerprints(db, columnsByTable) {
  // One round trip: a UNION ALL with one row per table.
  const parts = Object.entries(columnsByTable).map(([table, columns]) => {
    const list = columns.map((c) => `"${c}"`).join(',');
    return `SELECT '${table}' AS t, count(*)::text||':'||coalesce(md5(string_agg(md5(ROW(${list})::text),'' ORDER BY md5(ROW(${list})::text))),'') AS f FROM "${table}"`;
  });
  const file = join(scratch, `fp-${db}.sql`);
  writeFileSync(file, parts.join(' UNION ALL ') + ';');
  run('docker', ['cp', file, `${name}:/tmp/fp.sql`]);
  return Object.fromEntries(run('docker', [...psqlArgs(db), '-F', '|', '-q', '-f', '/tmp/fp.sql']).trim().split(String.fromCharCode(10)).map((l) => [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)]));
}
const columnsOf = (db) => {
  const out = {};
  for (const line of sql(`SELECT table_name||'|'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AND table_name<>'_prisma_migrations' ORDER BY table_name, ordinal_position`, db).split('\n').filter(Boolean)) {
    const [t, c] = line.split('|'); (out[t] ??= []).push(c);
  }
  return out;
};
const diffFingerprints = (a, b) => Object.keys(a).filter((t) => a[t] !== b[t]);

try {
  run('docker', ['image', 'inspect', image, '--format', '{{.Id}}']);
  run('docker', ['run', '--pull=never', '--rm', '-d', '--name', name, '--label', 'runly.commerce-rehearsal=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql', image]);
  created = true;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) break;
    if (attempt === 99) throw new Error('PostgreSQL local no inició.');
    await delay(100);
  }
  const port = run('docker', ['port', name, '5432']).trim().split(':').at(-1);
  const url = (db) => `postgresql://postgres@127.0.0.1:${port}/${db}`;
  sql('CREATE DATABASE rehearsal', 'postgres');
  sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN', 'postgres');

  // ---- 1. Starting point ---------------------------------------------------------
  if (dumpArg) {
    copyFileSync(dumpArg, join(scratch, 'source.dump'));
    run('docker', ['cp', join(scratch, 'source.dump'), `${name}:/tmp/source.dump`]);
    const isCustom = readMagic(dumpArg);
    if (isCustom) run('docker', ['exec', name, 'pg_restore', '-U', 'postgres', '-d', 'rehearsal', '--no-owner', '--no-privileges', '/tmp/source.dump']);
    else run('docker', [...psqlArgs('rehearsal'), '-q', '-f', '/tmp/source.dump']);
    record('restored the pilot copy into the disposable database', true, dumpArg.split(/[\\/]/).pop());
  } else {
    const schema = join(scratch, 'baseline.prisma'); const baselineSql = join(scratch, 'baseline.sql');
    writeFileSync(schema, run('git', ['show', `${BASELINE}:prisma/schema.prisma`]));
    run(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', schema, '--script', '--output', baselineSql], { env: safeEnv(assertLocal(url('rehearsal'))) });
    applyFile(baselineSql);
    sql(`WITH c AS (INSERT INTO company(id,name,slug,updated_at) VALUES(uuidv7(),'Empresa sintética','sintetica',now()) RETURNING id),
      u AS (INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),uuidv7(),'Operador','op@example.test',now()) RETURNING id),
      o AS (INSERT INTO pos_outlet(company_id,name,updated_at) SELECT id,'Sucursal',now() FROM c RETURNING *),
      t AS (INSERT INTO pos_terminal(company_id,outlet_id,name,updated_at) SELECT company_id,id,'Caja',now() FROM o RETURNING *),
      s AS (INSERT INTO pos_session(company_id,outlet_id,terminal_id,opened_by_id,status) SELECT t.company_id,t.outlet_id,t.id,u.id,'CLOSED' FROM t,u RETURNING *),
      m AS (INSERT INTO pos_payment_method(company_id,name,code,kind,updated_at) SELECT id,'Efectivo','cash','CASH',now() FROM c RETURNING id),
      p AS (INSERT INTO catalog_product(id,company_id,name,slug,price,stock,updated_at) SELECT uuidv7(),company_id,'Café','cafe',50,7,now() FROM o RETURNING *),
      ord AS (INSERT INTO pos_order(company_id,outlet_id,terminal_id,session_id,order_number,status,total_amount,paid_amount,created_by_id,updated_at)
        SELECT s.company_id,s.outlet_id,s.terminal_id,s.id,1,'PAID',50,50,u.id,now() FROM s,u RETURNING *),
      l AS (INSERT INTO pos_order_line(order_id,product_id,product_name,quantity,unit_price,total_amount,updated_at) SELECT ord.id,p.id,'Café',1,50,50,now() FROM ord,p RETURNING *)
      INSERT INTO pos_payment(company_id,order_id,session_id,payment_method_id,amount,created_by_id,status) SELECT ord.company_id,ord.id,ord.session_id,m.id,50,u.id,'CAPTURED' FROM ord,u,m`);
    record('built the pre-Commerce schema with synthetic history', true, `baseline ${BASELINE}`);
  }

  // ---- 2. Backup and fingerprint -----------------------------------------------------
  const before = columnsOf('rehearsal');
  const fpBefore = fingerprints('rehearsal', before);
  run('docker', ['exec', name, 'pg_dump', '-U', 'postgres', '-Fc', '-f', '/tmp/pre.dump', 'rehearsal']);
  record('backup taken (pg_dump -Fc) and every table fingerprinted', true, `${Object.keys(before).length} tables, ${Object.values(fpBefore).filter((v) => !v.startsWith('0:')).length} with rows`);

  // ---- 3. Preflight ------------------------------------------------------------------------
  const pre = spawnSync(process.execPath, ['scripts/commerce-recovery-preflight.mjs'], { cwd: root, encoding: 'utf8', env: { ...safeEnv(assertLocal(url('rehearsal'))), RUNLY_COMMERCE_PREFLIGHT_DATABASE_URL: url('rehearsal') } });
  record('read-only preflight finds nothing that needs reconciliation', pre.status === 0, pre.stdout.trim() || pre.stderr.trim().slice(0, 200));

  // ---- 4. Migrate ------------------------------------------------------------------------------
  const timings = [];
  for (const migration of MIGRATIONS) {
    const t = Date.now();
    applyFile(resolve(root, `prisma/migrations/${migration}/migration.sql`));
    timings.push(`${migration.slice(14)} ${Date.now() - t} ms`);
  }
  record('five Commerce migrations and the one transcript migration of this candidate applied in order', true, timings.join('; '));

  // ---- 5. Compare ----------------------------------------------------------------------------------
  const fpAfter = fingerprints('rehearsal', before);
  const changed = diffFingerprints(fpBefore, fpAfter);
  record('every pre-existing table keeps its rows and values (existing columns only)', changed.length === 0, changed.length ? `changed: ${changed.join(', ')}` : `${Object.keys(before).length} tables identical`);
  const after = columnsOf('rehearsal');
  const added = Object.keys(after).filter((t) => !before[t]);
  const touched = Object.keys(before).filter((t) => after[t].length !== before[t].length);
  const droppedCols = Object.keys(before).flatMap((t) => before[t].filter((c) => !after[t]?.includes(c)).map((c) => `${t}.${c}`));
  record('expand-only: no table or column was dropped', droppedCols.length === 0 && Object.keys(before).every((t) => after[t]), droppedCols.join(', '));
  // catalog_stock_balance is the one documented backfill: it mirrors the stock the products already held.
  const withRows = added.filter((t) => sql(`SELECT count(*) FROM "${t}"`) !== '0');
  const newEmpty = withRows.every((t) => t === 'catalog_stock_balance');
  record('new tables start empty, except the documented stock-balance mirror (no fabricated history)', newEmpty, `rows in: ${withRows.join(', ') || 'none'}; `+ `${added.length} new tables; ${touched.length} existing tables gained columns`);
  console.log(`  touched existing tables: ${touched.join(', ')}`);
  const drift = spawnSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: root, encoding: 'utf8', env: safeEnv(assertLocal(url('rehearsal'))) });
  // Statements that would ADD something the schema expects mean the migrations left the database short.
  // DROPs only remove hand-written extras (SQL-level foreign keys, indexes, uuidv7 defaults) that the
  // datamodel does not declare; they are reported, never applied.
  const statements = drift.stdout.split(/;[ 	]*$/m).map((x) => x.split(String.fromCharCode(10)).filter((l) => !l.startsWith("--")).join(" ").trim()).filter(Boolean);
  const missing = statements.filter((x) => /(CREATE TABLE|CREATE (UNIQUE )?INDEX|ADD COLUMN|ADD CONSTRAINT)/.test(x));
  const extras = statements.length - missing.length;
  if (statements.length) writeFileSync(join(process.cwd(), 'commerce-rehearsal-drift.sql'), drift.stdout);
  record('schema drift: nothing the schema expects is missing (prisma migrate diff ran cleanly)', drift.status === 0 && missing.length === 0, `${missing.length} missing; ${extras} database-side extras (FKs/indexes/defaults beyond the datamodel)${missing.length ? ': ' + missing[0].slice(0, 120) : ''}`);

  // ---- 6. Previous release still writes (code rollback without database rollback) -----------------------
  let legacyOk = true; let legacyDetail = '';
  try {
    sql(`WITH s AS (SELECT * FROM pos_session LIMIT 1), u AS (SELECT id FROM user_profile LIMIT 1),
      p AS (SELECT id FROM catalog_product LIMIT 1),
      ord AS (INSERT INTO pos_order(company_id,outlet_id,terminal_id,session_id,order_number,status,total_amount,paid_amount,created_by_id,updated_at)
        SELECT s.company_id,s.outlet_id,s.terminal_id,s.id,2,'PAID',20,20,u.id,now() FROM s,u RETURNING *),
      l AS (INSERT INTO pos_order_line(order_id,product_id,product_name,quantity,unit_price,total_amount,updated_at) SELECT ord.id,p.id,'Café',1,20,20,now() FROM ord,p RETURNING *)
      INSERT INTO pos_payment(company_id,order_id,session_id,payment_method_id,amount,created_by_id,status) SELECT ord.company_id,ord.id,ord.session_id,(SELECT id FROM pos_payment_method LIMIT 1),20,u.id,'CAPTURED' FROM ord,u`);
  } catch (error) { legacyOk = false; legacyDetail = String(error.stderr ?? error.message).trim().split('\n')[0]; }
  record('previous-release writers (old columns only) still insert orders, lines and payments', legacyOk, legacyDetail || 'order+line+payment accepted');

  // Direct writes by a rolled-back (previous) release to the catalog, where the migrations add guards.
  const tryWrite = (statement) => { try { sql(statement); return 'accepted'; } catch (error) { return 'REJECTED: ' + String(error.stderr ?? error.message).trim().split(String.fromCharCode(10))[0].slice(0, 110); } };
  const legacyCatalog = {
    'rename a product': tryWrite("UPDATE catalog_product SET name='Renombrado', updated_at=now() WHERE id=(SELECT id FROM catalog_product LIMIT 1)"),
    'change the base price': tryWrite("UPDATE catalog_product SET price=55, updated_at=now() WHERE id=(SELECT id FROM catalog_product LIMIT 1)"),
    'adjust stock directly': tryWrite("UPDATE catalog_product SET stock=stock+1, updated_at=now() WHERE id=(SELECT id FROM catalog_product LIMIT 1)"),
  };
  console.log('  previous-release direct catalog writes after the migrations:', JSON.stringify(legacyCatalog));
  record('INFO previous-release direct writes to the catalog (see detail; a code rollback is only safe for the ones accepted)', true, JSON.stringify(legacyCatalog));

  // ---- 6b. The API runs prisma/seed.js on every start: what does it change on an installed instance? ------------
  const seedEnv = safeEnv(assertLocal(url('rehearsal')));
  run(process.execPath, ['prisma/seed.js'], { env: seedEnv });
  const NEW_KEYS = "'pos.refunds.create','pos.discounts.apply'";
  sql(`DELETE FROM role_permission WHERE permission_id IN (SELECT id FROM permission WHERE key IN (${NEW_KEYS})); DELETE FROM permission WHERE key IN (${NEW_KEYS})`);
  const seedCols = columnsOf('rehearsal');
  const noStamp = Object.fromEntries(Object.entries(seedCols).map(([t, c]) => [t, c.filter((x) => !/^(updated_at|created_at)$/.test(x))]));
  const seedBefore = fingerprints('rehearsal', seedCols);
  const stampFreeBefore = fingerprints('rehearsal', noStamp);
  const modulesBefore = sql("SELECT string_agg(key||':'||status::text||':'||enabled::text, ',' ORDER BY key) FROM runly_module");
  run(process.execPath, ['prisma/seed.js'], { env: seedEnv });
  const seedAfter = fingerprints('rehearsal', seedCols);
  const seedChanged = diffFingerprints(seedBefore, seedAfter);
  const contentChanged = diffFingerprints(stampFreeBefore, fingerprints('rehearsal', noStamp));
  const allowed = new Set(['permission', 'role_permission', 'instance_config', 'runly_module', 'role', 'blueprint']);
  const business = seedChanged.filter((t) => !allowed.has(t));
  const newPermissions = sql(`SELECT count(*) FROM permission WHERE key IN (${NEW_KEYS})`);
  const newGrants = sql(`SELECT count(*) FROM role_permission rp JOIN permission p ON p.id=rp.permission_id JOIN role r ON r.id=rp.role_id WHERE p.key IN (${NEW_KEYS}) AND r.company_id IS NOT NULL`);
  record('seed on an installed instance: only catalog tables change, no business data', business.length === 0, `rows touched: ${seedChanged.join(', ') || 'none'}; content (ignoring timestamps) changed: ${contentChanged.join(', ') || 'none'}${business.length ? ' (UNEXPECTED: ' + business.join(', ') + ')' : ''}`);
  record('seed leaves module install state untouched', sql("SELECT string_agg(key||':'||status::text||':'||enabled::text, ',' ORDER BY key) FROM runly_module") === modulesBefore, 'status/enabled of every module identical');
  record('seed adds the two new permissions and grants them to NO company role (admins must assign them)', newPermissions === '2' && newGrants === '0', `permissions added ${newPermissions}, company-role grants ${newGrants}`);

  // ---- 7. Restore from the backup ---------------------------------------------------------------------------------
  sql('CREATE DATABASE restored', 'postgres');
  run('docker', ['exec', name, 'pg_restore', '-U', 'postgres', '-d', 'restored', '--no-owner', '/tmp/pre.dump']);
  const fpRestored = fingerprints('restored', before);
  const restoredDiff = diffFingerprints(fpBefore, fpRestored);
  record('restoring the backup returns every table to its pre-migration fingerprint', restoredDiff.length === 0, restoredDiff.join(', '));
  record('the restored copy has none of the Commerce objects', sql(`SELECT to_regclass('public.pos_command') IS NULL`, 'restored') === 't');
} catch (error) {
  record('rehearsal completed', false, String(error.stderr ?? error.message).trim().split('\n').slice(0, 3).join(' '));
} finally {
  if (created) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  rmSync(scratch, { recursive: true, force: true });
  const failed = steps.filter((x) => !x.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} rehearsal checks passed (${dumpArg ? 'pilot copy' : 'synthetic data'})`);
  process.exitCode = failed.length ? 1 : 0;
}

function readMagic(file) {
  const head = Buffer.alloc(5);
  const fd = execFileSync(process.execPath, ['-e', `const fs=require('fs');const b=Buffer.alloc(5);const f=fs.openSync(process.argv[1],'r');fs.readSync(f,b,0,5,0);process.stdout.write(b.toString('latin1'))`, file], { encoding: 'latin1' });
  void head;
  return fd.startsWith('PGDMP');
}
