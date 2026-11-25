import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_POLICY, ENGINE_VERSION, effectivePolicy, normalizeText, policySchema, processingAllowed, supportedFile, withinSchedule } from './policy.js';
import { fileKindWhere } from '../files/query.js';
import { isFilesOrigin } from '../files/visibility.js';
import { recordFilesWhere } from '../files/record-folders.js';
import { createContentPressure } from './resource-pressure.js';

const uuid = z.uuid();
const hash = value => createHash('sha256').update(value).digest('hex');
export class ContentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const pageSchema = z.object({
    unit: z.number().int().min(1).max(200),
    source: z.enum(['digital', 'ocr']), reference: z.string().max(160),
    text: z.string().max(200000),
    words: z.array(z.object({ text: z.string().max(500), x: z.number().nonnegative(), y: z.number().nonnegative(),
      width: z.number().nonnegative(), height: z.number().nonnegative(), confidence: z.number().min(0).max(100) })).max(20000).default([]),
    confidence: z.number().min(0).max(100).nullable().default(null),
    engine: z.object({ version: z.string().max(120), languages: z.string().max(100), model: z.string().max(200),
      canvas: z.object({ width: z.number().positive().max(40000000), height: z.number().positive().max(40000000),
        coordinateSpace: z.enum(['exif-oriented-image','pdf-raster']), pageWidth: z.number().positive().optional(), pageHeight: z.number().positive().optional(),
      }).optional(), secondPasses: z.number().int().min(0).max(10).optional(),
    }),
  });
const resultSchema = z.strictObject({
  pages: z.array(pageSchema).max(200).default([]),
  partial: z.boolean().default(false),
  errorCode: z.enum(['UNSUPPORTED', 'LIMIT', 'TIMEOUT', 'PARSER', 'DOWNLOAD', 'RESOURCES']).optional(),
  metrics: z.object({ cpuMs: z.number().int().nonnegative().max(3600000), peakRssBytes: z.number().int().nonnegative(),
    secondPasses: z.number().int().min(0).max(2000) }).optional(),
});

export function createContentIntelligence({ prisma, filesService, supabaseAdmin }) {
  const pressure = createContentPressure();
  async function policy(scope, db = prisma) {
    const rows = await db.$queryRaw`SELECT config FROM runly_content.policy WHERE scope = ${scope}`;
    return rows[0]?.config ?? DEFAULT_POLICY;
  }
  async function effective(companyId, db = prisma) {
    const [instance, company] = await Promise.all([policy('instance', db), policy(companyId, db)]);
    return effectivePolicy(instance, company);
  }
  async function audit(db, context, action, metadata) {
    await db.auditLog.create({ data: { actorId: context.profileId, companyId: context.companyId,
      moduleKey: 'runly.files', action: `content.${action}`, metadata } });
  }
  async function savePolicy(scope, input, context) {
    const config = policySchema.parse(input);
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(71620381)::text`;
      await db.$executeRaw`INSERT INTO runly_content.policy(scope,config) VALUES (${scope},${JSON.stringify(config)}::jsonb)
        ON CONFLICT (scope) DO UPDATE SET config=EXCLUDED.config, updated_at=now()`;
      if (scope !== 'instance' && config.profile !== 'OFF') {
        await db.$executeRaw`INSERT INTO runly_content.backfill(company_id,kind,state,filters)
          VALUES (${scope}::uuid,'new','running',jsonb_build_object('fromDate',now()))
          ON CONFLICT (company_id,kind) DO UPDATE SET state='running'`;
      }
      await audit(db, context, 'policy.update', { scope, config });
      return config;
    });
  }
  async function authorized(args) {
    uuid.parse(args.id);
    const file = await filesService.getById(args);
    if (!file.enabled || file.entityId !== args.activeContext.companyId) throw new ContentError('Archivo no encontrado.', 404);
    return file;
  }
  async function enqueue(db, file, p, { manual = false, priority = 20, quality = p.quality, reprocess = false } = {}) {
    if (p.profile === 'OFF' || p.paused || !processingAllowed(p, file, manual) || file.sizeBytes > p.maxFileBytes) return false;
    // All queue writers share this lock, including historical discovery.
    await db.$queryRaw`SELECT pg_advisory_xact_lock(71620381)::text`;
    const [capacity] = await db.$queryRaw`SELECT coalesce(sum(jobs),0)::int AS total,
      coalesce(sum(jobs) FILTER (WHERE company_id=${file.entityId}::uuid),0)::int AS company
      FROM runly_content.totals WHERE state IN ('pending','processing')`;
    if (capacity.total >= 4000 || capacity.company >= p.maxPending) return false;
    if (reprocess) await db.$executeRaw`DELETE FROM runly_content.job WHERE file_id=${file.id}::uuid AND state NOT IN ('pending','processing')`;
    const added = await db.$executeRaw`INSERT INTO runly_content.job(company_id,file_id,revision,object_key,manual,priority,quality)
      VALUES (${file.entityId}::uuid,${file.id}::uuid,${file.contentRevision},${file.objectKey},${manual},${priority},${quality})
      ON CONFLICT (file_id,revision) DO NOTHING`;
    return added > 0;
  }
  async function request(args, { quality, reprocess = false } = {}) {
    const file = await authorized(args);
    const p = await effective(file.entityId);
    if (p.profile === 'OFF' || p.paused) throw new ContentError('El procesamiento está desactivado o pausado.', 409);
    if (!supportedFile(file)) throw new ContentError('Formato no compatible.', 415);
    if (file.sizeBytes > p.maxFileBytes) throw new ContentError('El archivo excede el límite.', 413);
    const [worker] = await prisma.$queryRaw`SELECT id FROM runly_content.worker WHERE heartbeat_at > now()-interval '90 seconds' AND capabilities->>'governor'='ready' AND coalesce((capabilities->>'protocol')::int,1)>=2 LIMIT 1`;
    if (!worker) throw new ContentError('El worker está desconectado. Instala o inicia el servicio opcional.', 409);
    const queued = await prisma.$transaction(async db => {
      const ok = await enqueue(db, file, p, { manual: true, priority: 0, quality: quality ?? p.quality, reprocess });
      if (ok) await audit(db, args.activeContext, 'request', { fileId: file.id, quality: quality ?? p.quality });
      return ok;
    });
    if (!queued) throw new ContentError('El archivo ya está en cola o se alcanzó el límite de trabajos.', 409);
    return { queued };
  }
  async function result(args) {
    const file = await authorized(args);
    const p = await effective(file.entityId);
    if (!p.searchEnabled) return { state: 'disabled', pages: [] };
    const [job] = await prisma.$queryRaw`SELECT id,state,progress,error_code AS "errorCode",quality,updated_at AS "updatedAt",
      completed_units AS "completedUnits",total_units AS "totalUnits",derived_bytes::float AS "derivedBytes",elapsed_ms AS "elapsedMs"
      FROM runly_content.job WHERE file_id=${file.id}::uuid AND company_id=${file.entityId}::uuid
      AND revision=${file.contentRevision} AND object_key=${file.objectKey}`;
    if (!job) return { state: p.profile === 'OFF' ? 'disabled' : supportedFile(file) ? 'unprocessed' : 'unsupported', pages: [] };
    const pages = await prisma.$queryRaw`SELECT unit,source,reference,text,words,confidence,engine FROM runly_content.page WHERE job_id=${job.id}::uuid ORDER BY unit`;
    return { ...job, pages };
  }
  async function cancel(args) {
    const file = await authorized(args);
    // Reading shared content does not grant the right to destroy its index or cancel another user's job.
    if (!args.activeContext.isAdmin && file.uploadedById !== args.activeContext.profileId) throw new ContentError('Solo el propietario o un administrador puede cancelar.', 403);
    await prisma.$executeRaw`UPDATE runly_content.job SET state='cancelled',lease_hash=NULL,lease_until=NULL,updated_at=now()
      WHERE file_id=${file.id}::uuid AND company_id=${file.entityId}::uuid AND state IN ('pending','processing')`;
    return { cancelled: true };
  }
  async function search(args, query) {
    const companyId = args.activeContext.companyId;
    if (!(await effective(companyId)).searchEnabled) return { data: [], nextCursor: null };
    const q = String(query.q ?? '').trim().slice(0, 200);
    const normalized = normalizeText(q);
    if (!normalized) return { data: [], nextCursor: null };
    const cursor = query.cursor ? uuid.parse(query.cursor) : null;
    const source = query.searchIn === 'ocr' ? 'ocr' : null;
    const terms = normalized.split(' ').filter(Boolean);
    const tsquery = q.includes('"') ? terms.join(' <-> ') : terms.map(t => `${t}:*`).join(' & ');
    const folderId = query.folderId && query.folderId !== 'root' ? uuid.parse(query.folderId) : null;
    // Bounded candidate batches. No unauthorized counts, snippets or score side channels.
    const candidates = await prisma.$queryRaw`WITH matches AS (
      SELECT j.file_id AS id FROM runly_content.page p JOIN runly_content.job j ON j.id=p.job_id
      JOIN file_asset current ON current.id=j.file_id
      WHERE j.company_id=${companyId}::uuid AND current.enabled AND j.company_id=current.entity_id
        AND j.revision=current.content_revision AND j.object_key=current.object_key
        AND j.state IN ('done','partial','empty') AND (${source}::text IS NULL OR p.source=${source})
        AND p.search_vector @@ to_tsquery('simple',${tsquery})
      UNION
      SELECT id FROM file_asset WHERE ${query.searchIn === 'all'} AND entity_id=${companyId}::uuid AND enabled
        AND lower(original_name) LIKE ${`%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`}
    ) SELECT f.id FROM matches JOIN file_asset f ON f.id=matches.id
      WHERE f.entity_id=${companyId}::uuid AND f.enabled
      AND (${cursor}::uuid IS NULL OR f.id > ${cursor}::uuid)
      AND (${folderId}::uuid IS NULL OR f.folder_id=${folderId}::uuid)
      AND (${query.folderId !== 'root'} OR f.folder_id IS NULL)
      AND (${query.mime ?? ''}='' OR f.mime_type LIKE ${`${query.mime ?? ''}%`})
      AND (${query.moduleKey ?? ''}='' OR f.module_key=${query.moduleKey ?? ''})
      ORDER BY f.id LIMIT 50`;
    const data = [];
    const recordFilter = query.record ? await recordFilesWhere(prisma, companyId, String(query.record)) : null;
    for (const candidate of candidates) {
      let file;
      try { file = await authorized({ ...args, id: candidate.id }); }
      catch (error) { if ([403,404].includes(error.status)) continue; throw error; }
      if (query.workspace === 'mine' && file.uploadedById !== args.activeContext.profileId) continue;
      if (query.workspace === 'documents' && !isFilesOrigin(file)) continue;
      if (['modules','attachments'].includes(query.workspace) && isFilesOrigin(file)) continue;
      if (query.workspace === 'shared') {
        const share = await prisma.fileAssetShare.findUnique({ where: { fileId_userId: { fileId: file.id, userId: args.activeContext.profileId } } });
        if (share?.status !== 'ACCEPTED') continue;
      }
      if ((query.kind || recordFilter) && !await prisma.fileAsset.findFirst({ where: { id: file.id,
        AND: [fileKindWhere(query.kind), ...(recordFilter ? [recordFilter] : [])] }, select: { id: true } })) continue;
      const pages = await prisma.$queryRaw`SELECT p.unit,p.reference,p.source,p.text FROM runly_content.page p
        JOIN runly_content.job j ON j.id=p.job_id JOIN file_asset f ON f.id=j.file_id
        WHERE j.file_id=${file.id}::uuid AND f.enabled AND j.company_id=${companyId}::uuid
        AND j.revision=f.content_revision AND j.object_key=f.object_key AND j.state IN ('done','partial','empty')
        AND (${source}::text IS NULL OR p.source=${source}) AND p.search_vector @@ to_tsquery('simple',${tsquery}) ORDER BY p.unit LIMIT 1`;
      const match = pages[0];
      const at = match ? Math.max(0, normalizeText(match.text).indexOf(terms[0]) - 60) : 0;
      data.push({ ...file, contentMatch: match ? { source: match.source, page: match.unit, reference: match.reference, snippet: match.text.slice(at, at + 240), terms } : null });
    }
    return { data, nextCursor: candidates.length === 50 ? candidates.at(-1).id : null };
  }
  async function status(scope) {
    const instance = await policy('instance');
    const local = scope === 'instance' ? null : await policy(scope);
    const workers = await prisma.$queryRaw`SELECT id,capabilities,heartbeat_at AS "heartbeatAt",
      heartbeat_at > now()-interval '90 seconds' AS connected FROM runly_content.worker ORDER BY heartbeat_at DESC LIMIT 4`;
    const counts = await prisma.$queryRaw`SELECT state,sum(jobs)::int AS count,sum(derived_bytes)::float AS "derivedBytes",sum(units)::int AS units FROM runly_content.totals
      WHERE (${scope === 'instance'} OR company_id=${scope === 'instance' ? null : scope}::uuid) GROUP BY state`;
    const recent = await prisma.$queryRaw`SELECT state,error_code AS "errorCode",completed_units AS "completedUnits",total_units AS "totalUnits",
      elapsed_ms AS "elapsedMs",updated_at AS "updatedAt" FROM runly_content.job WHERE (${scope === 'instance'} OR company_id=${scope === 'instance' ? null : scope}::uuid)
      ORDER BY updated_at DESC LIMIT 20`;
    const [rate] = await prisma.$queryRaw`SELECT count(*)::int AS completed,
      coalesce(sum(elapsed_ms),0)::int AS "elapsedMs",max(finished_at) AS "lastActivity"
      FROM (SELECT elapsed_ms,finished_at FROM runly_content.attempt WHERE finished_at>now()-interval '15 minutes'
        AND (${scope === 'instance'} OR company_id=${scope === 'instance' ? null : scope}::uuid) ORDER BY finished_at DESC LIMIT 1000) recent`;
    const backfill = await prisma.$queryRaw`SELECT company_id AS "companyId",kind,state,cursor,discovered,enqueued,omitted,updated_at AS "updatedAt" FROM runly_content.backfill
      WHERE (${scope === 'instance'} OR company_id=${scope === 'instance' ? null : scope}::uuid) ORDER BY updated_at DESC LIMIT 100`;
    return { config: local ?? instance, effective: local ? effectivePolicy(instance, local) : instance,
      workers: scope === 'instance' ? workers : workers.map(w => ({ connected: w.connected, heartbeatAt: w.heartbeatAt,
        capabilities: { engine: w.capabilities.engine, languages: w.capabilities.languages, models: w.capabilities.models, protocol: w.capabilities.protocol } })),
      counts, recent, rate, backfill, engine: ENGINE_VERSION,
      ...(scope==='instance' ? { pressure: await pressure.observe() } : {}) };
  }
  async function backfill(companyId, action, filters, context) {
    uuid.parse(companyId);
    const p = await effective(companyId);
    if (['start','resume'].includes(action) && (!p.historical || p.profile === 'OFF')) throw new ContentError('Habilita la indexación histórica en instancia y empresa.', 409);
    return prisma.$transaction(async db => {
      if (action === 'start') {
        await db.$executeRaw`INSERT INTO runly_content.backfill(company_id,state,filters) VALUES (${companyId}::uuid,'running',${JSON.stringify(filters ?? {})}::jsonb)
          ON CONFLICT (company_id,kind) DO UPDATE SET state='running',cursor=NULL,discovered=0,enqueued=0,omitted=0,filters=EXCLUDED.filters,updated_at=now()`;
      } else {
        const state = { pause: 'paused', resume: 'running', cancel: 'cancelled' }[action];
        if (!state) throw new ContentError('Acción inválida.');
        await db.$executeRaw`UPDATE runly_content.backfill SET state=${state},updated_at=now() WHERE company_id=${companyId}::uuid AND kind='historical'`;
        if (action === 'cancel') await db.$executeRaw`UPDATE runly_content.job SET state='cancelled',lease_hash=NULL,lease_until=NULL,updated_at=now()
          WHERE company_id=${companyId}::uuid AND priority>=40 AND state IN ('pending','processing')`;
      }
      await audit(db, context, `backfill.${action}`, { companyId });
      return { ok: true };
    });
  }
  async function discover(db) {
    const [globalPending] = await db.$queryRaw`SELECT coalesce(sum(jobs),0)::int AS n FROM runly_content.totals WHERE state IN ('pending','processing')`;
    if (globalPending.n >= 4000) return;
    const scans = await db.$queryRaw`SELECT * FROM runly_content.backfill WHERE state='running'
      AND (kind='historical' OR updated_at<now()-interval '15 seconds') ORDER BY updated_at LIMIT 4 FOR UPDATE SKIP LOCKED`;
    for (const scan of scans) {
      const p = await effective(scan.company_id, db);
      if (p.profile === 'OFF' || p.paused || !p.schedules.every(schedule=>withinSchedule(schedule)) || (scan.kind === 'historical' && !p.historical)) continue;
      const [pending] = await db.$queryRaw`SELECT count(*)::int AS n FROM runly_content.job WHERE company_id=${scan.company_id}::uuid AND state IN ('pending','processing')`;
      const room = Math.min(10, p.maxPending - pending.n,4000-globalPending.n);
      if (room <= 0) continue;
      const files = await db.fileAsset.findMany({ where: { entityId: scan.company_id, enabled: true,
        ...(scan.cursor ? { id: { gt: scan.cursor } } : {}),
        ...(scan.filters.folderId ? { folderId: scan.filters.folderId } : {}),
        ...(scan.filters.mime ? { mimeType: { startsWith: scan.filters.mime } } : {}),
        ...(scan.filters.fromDate || scan.filters.toDate ? { [scan.kind === 'new' ? 'updatedAt' : 'createdAt']: {
          ...(scan.filters.fromDate ? { gte: new Date(scan.filters.fromDate) } : {}),
          ...(scan.filters.toDate ? { lte: new Date(scan.filters.toDate) } : {}),
        } } : {}),
      }, orderBy: { id: 'asc' }, take: room });
      let enqueued=0,omitted=0;
      const existing = files.length ? await db.$queryRaw`SELECT j.file_id,j.state,
        min(p.confidence) AS confidence,bool_or(p.engine->>'version'<>${ENGINE_VERSION}) AS old_engine
        FROM runly_content.job j LEFT JOIN runly_content.page p ON p.job_id=j.id
        WHERE j.file_id=ANY(${files.map(file=>file.id)}::uuid[]) GROUP BY j.file_id,j.state` : [];
      const byFile = new Map(existing.map(job=>[job.file_id,job]));
      for (const file of files) {
        const previous=byFile.get(file.id),mode=scan.filters.mode??'all';
        const selected=mode==='all' || (mode==='never'&&!previous) || (mode==='failed'&&previous?.state==='failed')
          || (mode==='lowQuality'&&previous?.confidence!=null&&previous.confidence<(scan.filters.belowConfidence??70))
          || (mode==='oldEngine'&&previous?.old_engine);
        if (selected && await enqueue(db,file,{...p,automaticProcessing:scan.kind==='historical'?p.historical:p.automaticProcessing},{
          priority:scan.kind==='new'?10:40,quality:scan.filters.quality??p.quality,reprocess:['failed','lowQuality','oldEngine'].includes(mode),
        })) { enqueued++;globalPending.n++; } else omitted++;
      }
      const finished = files.length < room && scan.kind === 'historical';
      const nextCursor = !files.length && scan.kind === 'new' ? null : files.at(-1)?.id ?? scan.cursor;
      await db.$executeRaw`UPDATE runly_content.backfill SET cursor=${nextCursor}::uuid,
        discovered=discovered+${files.length},enqueued=enqueued+${enqueued},omitted=omitted+${omitted},state=${finished ? 'done' : 'running'},updated_at=now()
        WHERE company_id=${scan.company_id}::uuid AND kind=${scan.kind}`;
    }
  }
  async function heartbeat(workerId, capabilities) {
    await prisma.$executeRaw`INSERT INTO runly_content.worker(id,capabilities) VALUES (${workerId},${JSON.stringify(capabilities)}::jsonb)
      ON CONFLICT(id) DO UPDATE SET capabilities=EXCLUDED.capabilities,heartbeat_at=now()`;
  }
  async function claim(workerId) {
    if ((await pressure.observe()).paused) return null;
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(71620381)::text`;
      const global = policySchema.parse(await policy('instance', db));
      const [worker] = await db.$queryRaw`SELECT id,capabilities FROM runly_content.worker WHERE id=${workerId}
        AND heartbeat_at>now()-interval '90 seconds' AND capabilities->>'governor'='ready' AND coalesce((capabilities->>'protocol')::int,1)>=2`;
      if (!worker) return null;
      const maintenance = await db.$queryRaw`INSERT INTO runly_content.maintenance(key) VALUES ('retention')
        ON CONFLICT(key) DO UPDATE SET last_run=now() WHERE runly_content.maintenance.last_run<now()-interval '5 minutes' RETURNING key`;
      if (maintenance.length) await db.$executeRaw`DELETE FROM runly_content.job WHERE id IN (
        SELECT j.id FROM runly_content.job j JOIN runly_content.policy cp ON cp.scope=j.company_id::text
        WHERE j.state NOT IN ('pending','processing') AND j.updated_at<now()-make_interval(days=>least(${global.retentionDays},coalesce((cp.config->>'retentionDays')::int,365)))
        ORDER BY j.updated_at LIMIT 50)`;
      if (global.profile === 'OFF' || global.paused) return null;
      await db.$executeRaw`UPDATE runly_content.attempt a SET finished_at=now(),error_code='LEASE_EXPIRED',
        elapsed_ms=least(coalesce((j.policy_snapshot->>'timeoutSeconds')::int,120)*1000,greatest(0,extract(epoch FROM (now()-a.started_at))*1000))::int
        FROM runly_content.job j WHERE a.job_id=j.id AND a.number=j.attempts AND a.finished_at IS NULL AND j.state='processing' AND j.lease_until<now()`;
      await db.$executeRaw`UPDATE runly_content.job SET state=CASE WHEN attempts>=${global.retries} THEN 'failed' ELSE 'pending' END,
        lease_hash=NULL,lease_until=NULL,error_code='LEASE_EXPIRED',available_at=now()+interval '30 seconds',updated_at=now()
        WHERE state='processing' AND lease_until<now()`;
      await discover(db);
      const [active] = await db.$queryRaw`SELECT count(*)::int AS n FROM runly_content.job WHERE state='processing'`;
      if (active.n >= global.concurrency) return null;
      // Aging guarantees historical progress; company occupancy gives other tenants a turn.
      const jobs = await db.$queryRaw`SELECT j.* FROM runly_content.job j
        JOIN runly_content.policy cp ON cp.scope=j.company_id::text
        JOIN company company ON company.id=j.company_id AND company.enabled
        WHERE j.state='pending' AND j.available_at<=now()
        AND coalesce(cp.config->>'profile','OFF')<>'OFF' AND NOT coalesce((cp.config->>'paused')::boolean,false)
        AND (j.priority<40 OR EXISTS (SELECT 1 FROM runly_content.backfill b WHERE b.company_id=j.company_id AND b.kind='historical' AND b.state IN ('running','done')))
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(cp.config->'languages','["spa","eng"]'::jsonb)) lang
          WHERE lang.value = ANY(${global.languages}::text[]))
        ORDER BY (SELECT count(*) FROM runly_content.job a WHERE a.company_id=j.company_id AND a.state='processing'),
        j.priority - EXTRACT(EPOCH FROM (now()-j.created_at))/60, j.created_at LIMIT 20 FOR UPDATE OF j SKIP LOCKED`;
      for (const job of jobs) {
        const p = await effective(job.company_id, db);
        if (p.profile === 'OFF' || p.paused || !p.schedules.every(schedule => withinSchedule(schedule))) continue;
        const [usage] = await db.$queryRaw`SELECT coalesce(sum(elapsed_ms),0)::float AS ms FROM runly_content.attempt
          WHERE started_at>=date_trunc('day',now() AT TIME ZONE ${p.schedule.timeZone}) AT TIME ZONE ${p.schedule.timeZone}
          AND company_id=${job.company_id}::uuid`;
        if (usage.ms>=p.dailyProcessingSeconds*1000) continue;
        const file = await db.fileAsset.findFirst({ where: { id: job.file_id, entityId: job.company_id, enabled: true, contentRevision: job.revision, objectKey: job.object_key } });
        if (!file) { await db.$executeRaw`DELETE FROM runly_content.job WHERE id=${job.id}::uuid`; continue; }
        if (!processingAllowed({ ...p, automaticProcessing: job.priority>=40 ? p.historical : p.automaticProcessing }, file, job.manual)) {
          await db.$executeRaw`UPDATE runly_content.job SET state='unsupported',error_code='POLICY',updated_at=now() WHERE id=${job.id}::uuid`;
          continue;
        }
        const minimumMiB = job.quality==='accurate' ? 384 : 256;
        if (Math.min(p.memoryMiB,(worker.capabilities.memoryLimit ?? 0)/1048576)<minimumMiB) {
          await db.$executeRaw`UPDATE runly_content.job SET state='failed',error_code='RESOURCES',updated_at=now() WHERE id=${job.id}::uuid`;
          continue;
        }
        const [companyActive] = await db.$queryRaw`SELECT count(*)::int AS n FROM runly_content.job WHERE company_id=${job.company_id}::uuid AND state='processing'`;
        if (companyActive.n >= p.concurrency) continue;
        const lease = randomBytes(32).toString('hex');
        const snapshot = { ...p, quality: job.quality, allowOcr: p.automaticOcr || (job.manual && p.manualOcr) };
        const pipeline = hash(JSON.stringify({ version: ENGINE_VERSION, quality: job.quality, languages: p.languages,
          maxPages: p.maxPages, maxPixels: p.maxPixels, digitalExtraction: p.digitalExtraction, allowOcr: snapshot.allowOcr,
          imageOcr: p.imageOcr, pdfOcr: p.pdfOcr, models: worker.capabilities.models }));
        if (job.pipeline_key !== pipeline) {
          await db.$executeRaw`DELETE FROM runly_content.page WHERE job_id=${job.id}::uuid`;
          await db.$executeRaw`UPDATE runly_content.job SET completed_units=0,total_units=NULL,derived_bytes=0,progress=0 WHERE id=${job.id}::uuid`;
        }
        await db.$executeRaw`UPDATE runly_content.job SET state='processing',attempts=attempts+1,worker_id=${workerId},
          pipeline_key=${pipeline},policy_snapshot=${JSON.stringify(snapshot)}::jsonb,started_at=now(),finished_at=NULL,
          lease_hash=${hash(lease)},lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=${job.id}::uuid`;
        await db.$executeRaw`INSERT INTO runly_content.attempt(job_id,number,company_id,engine)
          VALUES (${job.id}::uuid,${job.attempts+1},${job.company_id}::uuid,${JSON.stringify({ version: ENGINE_VERSION, quality: job.quality, models: worker.capabilities.models })}::jsonb)`;
        const completed = await db.$queryRaw`SELECT unit FROM runly_content.page WHERE job_id=${job.id}::uuid ORDER BY unit`;
        return { id: job.id, lease, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes,
          policy: snapshot, resumeUnits: completed.map(page => page.unit), engine: ENGINE_VERSION };
      }
      return null;
    }, { timeout: 15000 });
  }
  async function leased(db, id, lease) {
    uuid.parse(id);
    if (typeof lease !== 'string' || lease.length !== 64) throw new ContentError('Lease inválido.', 409);
    const [job] = await db.$queryRaw`SELECT j.*,f.bucket,f.size_bytes FROM runly_content.job j JOIN file_asset f ON f.id=j.file_id
      WHERE j.id=${id}::uuid AND j.lease_hash=${hash(lease)} AND j.state='processing' AND j.lease_until>now()
      AND f.enabled AND f.entity_id=j.company_id AND f.content_revision=j.revision AND f.object_key=j.object_key FOR UPDATE OF j`;
    if (!job) throw new ContentError('El trabajo ya no está autorizado.', 409);
    const p = await effective(job.company_id, db);
    if (p.profile === 'OFF' || p.paused) throw new ContentError('Procesamiento detenido.', 409);
    return { job, p };
  }
  async function renew(id, lease, progress) {
    return prisma.$transaction(async db => {
      await leased(db, id, lease);
      await db.$executeRaw`UPDATE runly_content.job SET lease_until=now()+interval '90 seconds',progress=GREATEST(progress,${progress}),updated_at=now() WHERE id=${id}::uuid`;
      return { ok: true };
    });
  }
  async function download(id, lease) {
    const { job, p } = await prisma.$transaction(db => leased(db, id, lease));
    if (job.size_bytes > p.maxFileBytes) throw new ContentError('Archivo excesivo.', 413);
    const { data, error } = await supabaseAdmin.storage.from(job.bucket).createSignedUrl(job.object_key, 60);
    if (error || !data?.signedUrl) throw new ContentError('No se pudo leer el original.', 422);
    const response = await fetch(data.signedUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new ContentError('No se pudo leer el original.', 422);
    if (Number(response.headers.get('content-length')) > p.maxFileBytes) {
      await response.body.cancel();
      throw new ContentError('Archivo excesivo.', 413);
    }
    // Stream with an independent byte ceiling: even incorrect object metadata cannot
    // force the API to buffer an oversized original before rejecting it.
    const reader = response.body.getReader();
    let received = 0;
    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          received += value.byteLength;
          if (received > p.maxFileBytes) { await reader.cancel(); controller.error(new Error('LIMIT')); return; }
          controller.enqueue(value);
        } catch { controller.error(new Error('DOWNLOAD')); }
      },
      cancel: reason => reader.cancel(reason),
    });
  }
  async function savePage(db, id, page, p, totalUnits = null) {
    if (page.unit>p.maxPages || (totalUnits && totalUnits>p.maxPages)) throw new ContentError('Demasiadas páginas.');
    const [existing] = await db.$queryRaw`SELECT coalesce(sum(length(text)),0)::int AS chars FROM runly_content.page WHERE job_id=${id}::uuid AND unit<>${page.unit}`;
    if (existing.chars+page.text.length>1000000) throw new ContentError('Resultado excesivo.');
    await db.$executeRaw`INSERT INTO runly_content.page(job_id,unit,source,reference,text,normalized,words,confidence,engine)
      VALUES (${id}::uuid,${page.unit},${page.source},${page.reference},${page.text},${normalizeText(page.text)},
      ${JSON.stringify(page.words)}::jsonb,${page.confidence},${JSON.stringify(page.engine)}::jsonb)
      ON CONFLICT(job_id,unit) DO UPDATE SET source=EXCLUDED.source,reference=EXCLUDED.reference,text=EXCLUDED.text,
        normalized=EXCLUDED.normalized,words=EXCLUDED.words,confidence=EXCLUDED.confidence,engine=EXCLUDED.engine`;
    await db.$executeRaw`UPDATE runly_content.job SET
      completed_units=(SELECT count(*) FROM runly_content.page WHERE job_id=${id}::uuid),
      derived_bytes=(SELECT coalesce(sum(octet_length(text)+octet_length(normalized)+pg_column_size(words)+pg_column_size(engine)),0) FROM runly_content.page WHERE job_id=${id}::uuid),
      total_units=coalesce(${totalUnits}::int,total_units),updated_at=now() WHERE id=${id}::uuid`;
  }
  async function checkpoint(id, lease, input) {
    const { page, totalUnits } = z.strictObject({ page: pageSchema, totalUnits: z.number().int().min(1).max(200).nullable().default(null) }).parse(input);
    return prisma.$transaction(async db => {
      const { p } = await leased(db,id,lease);
      await savePage(db,id,page,p,totalUnits);
      await db.$executeRaw`UPDATE runly_content.job SET lease_until=now()+interval '90 seconds',
        progress=CASE WHEN total_units>0 THEN least(99,completed_units*100/total_units) ELSE progress END WHERE id=${id}::uuid`;
      return { saved: page.unit };
    });
  }
  async function complete(id, lease, input) {
    const result = resultSchema.parse(input);
    if (result.pages.reduce((n, page) => n + page.text.length, 0) > 1000000 || new Set(result.pages.map(p => p.unit)).size !== result.pages.length) throw new ContentError('Resultado excesivo o duplicado.');
    return prisma.$transaction(async db => {
      const { job, p } = await leased(db, id, lease);
      if (result.pages.length > p.maxPages) throw new ContentError('Demasiadas páginas.');
      for (const page of result.pages) {
        await savePage(db,id,page,p);
      }
      const [saved] = await db.$queryRaw`SELECT count(*)::int AS units,coalesce(bool_or(length(trim(text))>0),false) AS "hasText"
        FROM runly_content.page WHERE job_id=${id}::uuid`;
      const retry = result.errorCode && job.attempts < p.retries && !['UNSUPPORTED','LIMIT'].includes(result.errorCode);
      const state = retry ? 'pending' : result.errorCode === 'UNSUPPORTED' && !saved.units ? 'unsupported'
        : result.errorCode && !saved.units ? 'failed' : result.partial || result.errorCode ? 'partial'
          : saved.hasText ? 'done' : 'empty';
      await db.$executeRaw`UPDATE runly_content.attempt SET finished_at=now(),
        elapsed_ms=least(${p.timeoutSeconds*1000},greatest(0,extract(epoch FROM (now()-started_at))*1000))::int,
        cpu_ms=${result.metrics?.cpuMs ?? 0},peak_rss_bytes=${result.metrics?.peakRssBytes ?? null}::bigint,
        second_passes=${result.metrics?.secondPasses ?? 0},error_code=${result.errorCode ?? null}
        WHERE job_id=${id}::uuid AND number=${job.attempts}`;
      await db.$executeRaw`UPDATE runly_content.job SET state=${state},progress=CASE WHEN ${Boolean(retry)} THEN progress ELSE 100 END,error_code=${result.errorCode ?? null},
        elapsed_ms=(SELECT coalesce(sum(elapsed_ms),0) FROM runly_content.attempt WHERE job_id=${id}::uuid),finished_at=CASE WHEN ${Boolean(retry)} THEN NULL ELSE now() END,
        lease_hash=NULL,lease_until=NULL,available_at=now()+make_interval(secs=>${Math.min(900, 15 * 2 ** job.attempts)}),updated_at=now() WHERE id=${id}::uuid`;
      return { state };
    }, { timeout: 15000 });
  }
  async function purge(companyId, context) {
    return prisma.$transaction(async db => {
      await db.$executeRaw`DELETE FROM runly_content.job WHERE company_id=${companyId}::uuid`;
      await db.$executeRaw`UPDATE runly_content.backfill SET state='cancelled' WHERE company_id=${companyId}::uuid`;
      await audit(db, context, 'purge', {});
      return { ok: true };
    });
  }
  return { policy, effective, savePolicy, request, result, cancel, search, status, backfill, heartbeat, claim, renew, download, checkpoint, complete, purge };
}
