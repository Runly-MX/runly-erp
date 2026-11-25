import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { serve } from '@hono/node-server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createContentIntelligence } from './service.js';
import { createFilesService } from '../files-service.js';
import { createContentIntelligenceRouter } from '../../routes/content-intelligence.js';

const url = process.env.CI_CONTENT_DATABASE_URL;
let db, pool, service, companyId, otherCompany, owner, viewer, file, args, filesService, storage;
let originalBytes = Buffer.from('synthetic original');
const policy = { profile: 'SMART', historical: true, concurrency: 2 };
const worker = { engine: 'test', languages: ['spa','eng'], models: {}, cpuLimit: 1, memoryLimit: 536870912, memoryUsed: 100000000, governor: 'ready' };
const page = text => ({ unit: 1, source: 'ocr', reference: 'Imagen 1', text, engine: { version: 'test', languages: 'spa+eng', model: 'synthetic' } });

before(async () => {
  if (!url) return;
  const target = new URL(url);
  assert.ok(['localhost','127.0.0.1'].includes(target.hostname) && target.pathname === '/content_intelligence_test', 'Only an isolated local test database is allowed');
  pool = new pg.Pool({ connectionString: url });
  await pool.query(`DROP SCHEMA IF EXISTS runly_content CASCADE;
    DROP TABLE IF EXISTS file_asset_share,file_folder_member,file_folder,file_asset,audit_log,company CASCADE;
    DROP TYPE IF EXISTS file_visibility;
    CREATE TYPE file_visibility AS ENUM ('PRIVATE','INTERNAL','PUBLIC');
    CREATE TABLE company(id uuid PRIMARY KEY DEFAULT uuidv7(),name text,enabled boolean DEFAULT true);
    CREATE TABLE file_asset(id uuid PRIMARY KEY DEFAULT uuidv7(),bucket text NOT NULL,object_key text NOT NULL,original_name text NOT NULL,
      mime_type text NOT NULL,size_bytes int NOT NULL,checksum text,content_revision int NOT NULL DEFAULT 1,office_lock text,office_lock_expires_at timestamp,
      access_scope text NOT NULL DEFAULT 'COMPANY',creation_key text,visibility file_visibility NOT NULL DEFAULT 'PRIVATE',module_key text,entity_type text,entity_id uuid,
      uploaded_by_id uuid,metadata jsonb,enabled boolean NOT NULL DEFAULT true,is_cover boolean DEFAULT false,sort_order int DEFAULT 0,folder_id uuid,
      created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE file_asset_share(id uuid PRIMARY KEY DEFAULT uuidv7(),file_id uuid,user_id uuid,role text DEFAULT 'VIEWER',status text DEFAULT 'PENDING',
      invited_by_id uuid,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),UNIQUE(file_id,user_id));
    CREATE TABLE file_folder(id uuid PRIMARY KEY DEFAULT uuidv7(),company_id uuid,parent_id uuid);
    CREATE TABLE file_folder_member(id uuid PRIMARY KEY DEFAULT uuidv7(),folder_id uuid,user_id uuid);
    CREATE TABLE audit_log(id uuid PRIMARY KEY DEFAULT uuidv7(),company_id uuid,actor_id uuid,module_key text,entity_type text,entity_id uuid,action text,
      before jsonb,after jsonb,metadata jsonb,created_at timestamp DEFAULT now());`);
  await pool.query(await readFile(new URL('../../../../../prisma/migrations/20270115000000_content_intelligence/migration.sql', import.meta.url), 'utf8'));
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const ids = (await pool.query("SELECT uuidv7() AS a, uuidv7() AS b, uuidv7() AS c, uuidv7() AS d")).rows[0];
  [companyId,otherCompany,owner,viewer] = [ids.a,ids.b,ids.c,ids.d];
  await pool.query('INSERT INTO company(id,name) VALUES ($1,$2),($3,$4)', [companyId,'Empresa sintética',otherCompany,'Otra empresa sintética']);
  file = await db.fileAsset.create({ data: { bucket: 'test', objectKey: 'synthetic.png', originalName: 'Etiqueta sintética.png', mimeType: 'image/png', sizeBytes: 1000,
    entityType: 'AtlasFile', moduleKey: 'runly.files', entityId: companyId, uploadedById: owner, accessScope: 'RESTRICTED' } });
  args = { authUserId: 'unused', activeContext: { companyId, profileId: owner, isAdmin: true, permissionSet: new Set() }, id: file.id };
  const bytes = key => key.startsWith('bulk-') ? Buffer.from('Texto sintético BULK987 para buscar') : originalBytes;
  storage = { storage: { from: () => ({ download: async key => ({ data: new Blob([bytes(key)]) }),
    createSignedUrl: async key => ({ data: { signedUrl: `data:application/octet-stream;base64,${bytes(key).toString('base64')}` } }),
  }) } };
  filesService = createFilesService({ prisma: db, supabaseAdmin: storage });
  service = createContentIntelligence({ prisma: db, filesService, supabaseAdmin: storage });
});
after(async () => { await db?.$disconnect(); await pool?.end(); });

test('PostgreSQL vertical slice: OFF, leases, OCR results, current ACL, revisions and backfill', { skip: !url }, async () => {
  assert.equal((await service.result(args)).state, 'disabled');
  await assert.rejects(service.request(args), /desactivado/);
  assert.equal((await service.search(args, { q: 'ABC123', searchIn: 'content' })).data.length, 0);
  await service.savePolicy('instance', policy, args.activeContext);
  await service.savePolicy(companyId, policy, args.activeContext);
  await assert.rejects(service.request(args), /desconectado/);
  await service.heartbeat('test-worker', worker);
  await service.request(args);
  await assert.rejects(service.request(args), /cola/);
  const job = await service.claim('test-worker');
  assert.ok(job.lease);
  assert.equal((await Promise.all([service.claim('test-worker'), service.claim('test-worker')])).filter(Boolean).length, 0);
  await assert.rejects(service.complete(job.id, '0'.repeat(64), { pages: [page('ABC123')] }), /autorizado/);
  await service.renew(job.id, job.lease, 40);
  await service.renew(job.id, job.lease, 0);
  assert.equal((await service.result(args)).progress, 40);
  const savedBytes = originalBytes;
  originalBytes = Buffer.alloc(2048, 65);
  await service.savePolicy('instance', { ...policy, maxFileBytes: 1024 }, args.activeContext);
  await assert.rejects(async () => new Response(await service.download(job.id, job.lease)).arrayBuffer(), /LIMIT|excesivo/);
  originalBytes = savedBytes;
  await service.savePolicy('instance', policy, args.activeContext);
  await service.complete(job.id, job.lease, { pages: [page('Número de serie ABC123 O0-I1-S5-B8-Z2')] });
  assert.equal((await service.result(args)).state, 'done');
  assert.equal((await service.search(args, { q: 'abc123', searchIn: 'ocr' })).data[0].id, file.id);
  assert.equal((await service.search(args, { q: 'numero', searchIn: 'content' })).data.length, 1);
  const stranger = { ...args, activeContext: { ...args.activeContext, profileId: viewer, isAdmin: false } };
  await assert.rejects(service.result(stranger), /no encontrado/);
  assert.equal((await service.search(stranger, { q: 'ABC123' })).data.length, 0);
  await pool.query("INSERT INTO file_asset_share(file_id,user_id,status) VALUES ($1,$2,'ACCEPTED')", [file.id,viewer]);
  assert.equal((await service.result(stranger)).pages.length, 1);
  await pool.query("UPDATE file_asset_share SET status='REVOKED' WHERE user_id=$1", [viewer]);
  await assert.rejects(service.result(stranger), /no encontrado/);
  const foreign = { ...args, activeContext: { ...args.activeContext, companyId: otherCompany } };
  await assert.rejects(service.result(foreign), /no encontrado/);
  assert.equal((await service.search(foreign, { q: 'ABC123' })).data.length, 0);
  await db.fileAsset.update({ where: { id: file.id }, data: { contentRevision: 2, objectKey: 'revision2.png' } });
  assert.equal((await service.result(args)).state, 'pending');
  assert.equal((await service.search(args, { q: 'ABC123' })).data.length, 0);
  const interrupted = await service.claim('test-worker');
  await service.cancel(args);
  await assert.rejects(service.complete(interrupted.id, interrupted.lease, { pages: [page('stale')] }), /autorizado/);
  await service.request(args, { reprocess: true });
  const expired = await service.claim('test-worker');
  await pool.query("UPDATE runly_content.job SET lease_until=now()-interval '1 second' WHERE id=$1", [expired.id]);
  assert.equal(await service.claim('test-worker'), null);
  await pool.query('UPDATE runly_content.job SET available_at=now() WHERE id=$1', [expired.id]);
  await service.heartbeat('restarted-worker', worker);
  const recovered = await service.claim('restarted-worker');
  assert.notEqual(recovered.lease, expired.lease);
  await assert.rejects(service.complete(expired.id, expired.lease, { pages: [page('stale')] }), /autorizado/);
  await service.complete(recovered.id, recovered.lease, { pages: [], errorCode: 'LIMIT' });
  assert.equal((await service.result(args)).state, 'failed');
  await db.fileAsset.update({ where: { id: file.id }, data: { enabled: false } });
  await assert.rejects(service.result(args), /no encontrado/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM runly_content.page')).rows[0].n, 0);
  await db.fileAsset.update({ where: { id: file.id }, data: { enabled: true } });
  await service.backfill(companyId, 'start', {}, args.activeContext);
  await service.backfill(companyId, 'pause', {}, args.activeContext);
  assert.equal((await service.status(companyId)).backfill.find(s => s.kind === 'historical').state, 'paused');
  await service.backfill(companyId, 'resume', {}, args.activeContext);
  const historical = await service.claim('test-worker');
  assert.equal(historical.id != null, true);
  await service.complete(historical.id, historical.lease, { pages: [page('Histórico encontrado')] });
  assert.equal((await service.search(args, { q: 'historico' })).data.length, 1);
  await service.savePolicy('instance', { profile: 'OFF', searchEnabled: true }, args.activeContext);
  assert.equal(await service.claim('test-worker'), null);
  assert.equal((await service.result(args)).state, 'done');
  await service.savePolicy('instance', { profile: 'OFF', searchEnabled: false }, args.activeContext);
  assert.equal((await service.result(args)).pages.length, 0);
  await service.purge(companyId, args.activeContext);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM runly_content.job')).rows[0].n, 0);
});

test('worker routes fail closed with missing, incorrect or multibyte credentials', { skip: !url }, async () => {
  const app = createContentIntelligenceRouter({ prisma: db, filesService: {}, supabaseAdmin: {}, authMiddleware: async (_c,n) => n(), requirePermission: () => async (_c,n) => n(), env: { RUNLY_CONTENT_WORKER_TOKEN: 'a'.repeat(32) } });
  for (const authorization of ['', 'Bearer wrong', `Bearer ${'ñ'.repeat(32)}`]) {
    const response = await app.request('/content/worker/claim', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify({ id: 'test' }) });
    assert.equal(response.status, 401);
  }
});

test('current folder ACL, ownership and company moves apply to existing derived text', { skip: !url }, async () => {
  await service.savePolicy('instance', policy, args.activeContext);
  await service.savePolicy(companyId, policy, args.activeContext);
  await service.heartbeat('test-worker', worker);
  const folders = (await pool.query('INSERT INTO file_folder(company_id) VALUES ($1),($1) RETURNING id', [companyId])).rows;
  await pool.query('INSERT INTO file_folder_member(folder_id,user_id) VALUES ($1,$2)', [folders[0].id,viewer]);
  const entry = await db.fileAsset.create({ data: { bucket: 'test', objectKey: 'folder.txt', originalName: 'Privado.txt', mimeType: 'text/plain', sizeBytes: 100,
    entityType: 'AtlasFile', moduleKey: 'runly.files', entityId: companyId, uploadedById: owner, accessScope: 'RESTRICTED', folderId: folders[0].id } });
  const job = await service.claim('test-worker');
  await service.complete(job.id, job.lease, { pages: [page('FOLDERSECRET987')] });
  const reader = { ...args, id: entry.id, activeContext: { ...args.activeContext, profileId: viewer, isAdmin: false } };
  assert.equal((await service.result(reader)).pages.length, 1);
  await db.fileAsset.update({ where: { id: entry.id }, data: { folderId: folders[1].id } });
  await assert.rejects(service.result(reader), /no encontrado/);
  await db.fileAsset.update({ where: { id: entry.id }, data: { uploadedById: viewer, folderId: null } });
  assert.equal((await service.result(reader)).pages.length, 1);
  const formerOwner = { ...args, id: entry.id, activeContext: { ...args.activeContext, isAdmin: false } };
  await assert.rejects(service.result(formerOwner), /no encontrado/);
  await db.fileAsset.update({ where: { id: entry.id }, data: { entityId: otherCompany } });
  await assert.rejects(service.result(reader), /no encontrado/);
  assert.equal((await service.search(args, { q: 'FOLDERSECRET987' })).data.length, 0);
  await service.savePolicy('instance', { profile: 'OFF' }, args.activeContext);
});

test('real isolated Docker worker: historical image -> download -> OCR -> indexed search', { skip: !url || process.env.CI_CONTENT_DOCKER !== '1', timeout: 300000 }, async () => {
  const run = promisify(execFile);
  const corpusDir = fileURLToPath(new URL('../../../../content-worker', import.meta.url));
  const generated = await run('docker', ['run','--rm','--network','none','--mount',`type=bind,source=${corpusDir},target=/tests,readonly`,
    '--workdir','/tests','runly-content-test','python3','-c',"from test_worker import label; import sys; label().save(sys.stdout.buffer, 'PNG')"], { encoding: 'buffer', maxBuffer: 2000000 });
  originalBytes = generated.stdout;
  const workerToken = 'synthetic-test-worker-key-with-no-production-access';
  const app = createContentIntelligenceRouter({ prisma: db, filesService, supabaseAdmin: storage,
    authMiddleware: async (c, next) => { c.set('companyId', companyId); c.set('userId', owner); c.set('authUserId', 'synthetic'); c.set('tenantContext', { isAdmin: true, isCompanyAdmin: true, permissionSet: new Set() }); return next(); },
    requirePermission: () => async (_c,next) => next(), env: { RUNLY_CONTENT_WORKER_TOKEN: workerToken } });
  const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port: 0 });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const name = 'runly-content-e2e-test';
  const workerNames = [name];
  const startWorker = (containerName, id, cpus = '1', memory = '1g') => run('docker', ['run','--detach','--name',containerName,'--cpus',cpus,'--memory',memory,'--pids-limit','64','--read-only',
    '--tmpfs','/tmp:size=268435456,mode=1777,noexec,nosuid,nodev','--cap-drop','ALL','--security-opt','no-new-privileges:true',
    '--env',`RUNLY_CONTENT_API_URL=http://host.docker.internal:${port}`,'--env',`RUNLY_CONTENT_WORKER_TOKEN=${workerToken}`,
    '--env',`RUNLY_CONTENT_WORKER_ID=${id}`,'--mount',`type=bind,source=${fileURLToPath(new URL('../../../../content-worker/worker.py', import.meta.url))},target=/app/worker.py,readonly`, 'runly-content-test']);
  try {
    // OFF uploads do not queue; explicit historical activation later discovers the same original.
    const historic = await db.fileAsset.create({ data: { bucket: 'test', objectKey: 'historic.png', originalName: 'Etiqueta histórica.png', mimeType: 'image/png', sizeBytes: originalBytes.length,
      entityType: 'AtlasFile', moduleKey: 'runly.files', entityId: companyId, uploadedById: owner, accessScope: 'RESTRICTED' } });
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM runly_content.job WHERE file_id=$1', [historic.id])).rows[0].n, 0);
    await service.savePolicy('instance', policy, args.activeContext);
    await service.savePolicy(companyId, policy, args.activeContext);
    await service.backfill(companyId, 'start', {}, args.activeContext);
    await startWorker(name, 'e2e-test');
    let output;
    const started = Date.now();
    while (Date.now() - started < 70000) {
      output = await service.result({ ...args, id: historic.id });
      if (['done','failed','unsupported'].includes(output.state)) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(output.state, 'done');
    assert.ok(output.pages.some(p => p.source === 'ocr' && p.text.includes('ABC123XYZ')), JSON.stringify(output.pages.map(p => p.text)));
    const response = await app.request('/content/search?q=ABC123XYZ&searchIn=ocr');
    assert.equal(response.status, 200);
    assert.ok((await response.json()).data.some(f => f.id === historic.id));
    const unchanged = await db.fileAsset.findUnique({ where: { id: historic.id } });
    assert.equal(unchanged.contentRevision, 1);
    assert.equal(unchanged.objectKey, 'historic.png');
    console.log(JSON.stringify({ e2e: 'historical-ocr-search', elapsedMs: Date.now()-started, recognized: output.pages[0].text }));
    if (process.env.CI_CONTENT_BENCH === '1') {
      await service.savePolicy('instance', { profile: 'OFF' }, args.activeContext);
      await pool.query(`INSERT INTO file_asset(bucket,object_key,original_name,mime_type,size_bytes,entity_type,module_key,entity_id,uploaded_by_id,access_scope)
        SELECT 'test','bulk-'||n,'Documento '||n||'.txt','text/plain',50,'AtlasFile','runly.files',$1,$2,'RESTRICTED'
        FROM generate_series(1,1000) n`, [companyId,owner]);
      const limits = { profile: 'SMART', historical: true, maxPending: 20, concurrency: 4 };
      await service.savePolicy('instance', limits, args.activeContext);
      await service.savePolicy(companyId, limits, args.activeContext);
      await service.backfill(companyId, 'start', { mime: 'text/' }, args.activeContext);
      for (let n=2; n<=4; n++) workerNames.push(`${name}-${n}`);
      await Promise.all(workerNames.slice(1).map((containerName, n) => startWorker(containerName, `e2e-${n+2}`, '0.25', '512m')));
      const begin = Date.now();
      let count = 0, maximumQueue = 0;
      const latencies = [];
      while (Date.now()-begin < 220000) {
        const at = performance.now();
        const [stats] = (await pool.query(`SELECT count(*) FILTER(WHERE j.state='done')::int AS done,
          count(*) FILTER(WHERE j.state IN ('pending','processing'))::int AS pending
          FROM runly_content.job j JOIN file_asset f ON f.id=j.file_id WHERE f.object_key LIKE 'bulk-%'`)).rows;
        latencies.push(performance.now()-at);
        count = stats.done;
        maximumQueue = Math.max(maximumQueue, stats.pending);
        if (count === 1000) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      latencies.sort((a,b) => a-b);
      console.log(JSON.stringify({ benchmark: '1000-historical-text-files', done: count, seconds: (Date.now()-begin)/1000, maximumQueue,
        statisticsQueryP95Ms: latencies[Math.floor(latencies.length*0.95)] }));
      assert.equal(count, 1000);
      assert.ok(maximumQueue <= 20);
      assert.equal((await service.search(args, { q: 'BULK987', searchIn: 'content' })).data.length, 50);
      const plan = await pool.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT job_id FROM runly_content.page WHERE search_vector @@ to_tsquery('simple','bulk987')");
      console.log(JSON.stringify({ ftsPlan: plan.rows[0]['QUERY PLAN'] }));
    }
  } finally {
    await run('docker', ['rm','--force',...workerNames]).catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
});
