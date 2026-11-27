import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_POLICY, ENGINE_VERSION, effectivePolicy, normalizeText, operationalState, policySchema, processingAllowed, supportedFile, withinSchedule } from './policy.js';
import { fileKindWhere } from '../files/query.js';
import { isFilesOrigin } from '../files/visibility.js';
import { recordFilesWhere } from '../files/record-folders.js';
import { createContentPressure } from './resource-pressure.js';
import { searchQuery } from './search-query.js';
import { toInternalSupabaseUrl } from '../../lib/supabase-public-url.js';

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
      width: z.number().nonnegative(), height: z.number().nonnegative(), confidence: z.number().min(0).max(100),
      polygon: z.array(z.number().nonnegative()).length(8).optional() })).max(20000).default([]),
    confidence: z.number().min(0).max(100).nullable().default(null),
    engine: z.object({ version: z.string().max(120), languages: z.string().max(100), model: z.string().max(200),
      canvas: z.object({ width: z.number().positive().max(40000000), height: z.number().positive().max(40000000),
        coordinateSpace: z.enum(['exif-oriented-image','pdf-raster']), pageWidth: z.number().positive().optional(), pageHeight: z.number().positive().optional(),
      }).optional(), secondPasses: z.number().int().min(0).max(10).optional(),
      analysis: z.object({ contrast: z.number().optional(), sharpness: z.number().optional(), perspective: z.enum(['none','candidate','applied']).optional(), heif: z.boolean().optional() }).optional(),
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
  // Cursors contain authorized positions only; encrypt ranks and scope them to
  // the caller/query. Restart requires a fresh search.
  const cursorKey=randomBytes(32);
  function encodeCursor(candidate,scope) {
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cursorKey,nonce);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify({...candidate,scope,expires:Date.now()+900000})),cipher.final()]);
    return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
  function decodeCursor(value,scope) {
    try {
      if(String(value).length>1024)throw Error();
      const bytes=Buffer.from(String(value),'base64url'),decipher=createDecipheriv('aes-256-gcm',cursorKey,bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));
      const cursor=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
      uuid.parse(cursor.id);z.number().int().min(0).max(100).parse(cursor.rank);
      if(cursor.scope!==scope||cursor.expires<Date.now())throw Error();
      return cursor;
    } catch {throw new ContentError('Cursor inválido. Reinicia la búsqueda.');}
  }
  async function policy(scope, db = prisma) {
    const rows = await db.$queryRaw`SELECT config FROM runly_content.policy WHERE scope = ${scope}`;
    return policySchema.parse(rows[0]?.config ?? DEFAULT_POLICY);
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
    if (p.profile === 'OFF' || p.paused || !processingAllowed({ ...p, automaticProcessing: priority>=40 ? p.historical : p.automaticProcessing }, file, manual) || file.sizeBytes > p.maxFileBytes) return false;
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
    if (!processingAllowed(p,file,true)) throw new ContentError('La política no permite procesar este tipo de archivo.',409);
    if (file.sizeBytes > p.maxFileBytes) throw new ContentError('El archivo excede el límite.', 413);
    const [worker] = await prisma.$queryRaw`SELECT id FROM runly_content.worker WHERE heartbeat_at > now()-interval '90 seconds' AND capabilities->>'governor' IN ('ready','paused') AND coalesce((capabilities->>'protocol')::int,1)>=2 LIMIT 1`;
    if (!worker) throw new ContentError('El worker está desconectado. Instala o inicia el servicio opcional.', 409);
    const queued = await prisma.$transaction(async db => {
      const ok = await enqueue(db, file, p, { manual: true, priority: 0, quality: quality ?? p.quality, reprocess });
      if (ok) await audit(db, args.activeContext, 'request', { fileId: file.id, quality: quality ?? p.quality });
      return ok;
    });
    if (!queued) throw new ContentError('El archivo ya está en cola o se alcanzó el límite de trabajos.', 409);
    return { queued };
  }
  // Words (coordinates) are the heavy part: return them for a requested page, or for pages while the running
  // total stays under the budget. Other pages report `wordCount` and `wordsOmitted`; the viewer asks per page.
  const WORD_BUDGET = 1500; // coordinates returned on open; typical pages are 100-600 words, larger documents stream per page
  async function result(args, { unit = null } = {}) {
    const file = await authorized(args);
    const p = await effective(file.entityId);
    if (!p.searchEnabled) return { state: 'disabled', pages: [] };
    const [job] = await prisma.$queryRaw`SELECT id,state,progress,error_code AS "errorCode",quality,updated_at AS "updatedAt",
      completed_units AS "completedUnits",total_units AS "totalUnits",derived_bytes::float AS "derivedBytes",elapsed_ms AS "elapsedMs"
      FROM runly_content.job WHERE file_id=${file.id}::uuid AND company_id=${file.entityId}::uuid
      AND revision=${file.contentRevision} AND object_key=${file.objectKey}`;
    if (!job) return { state: p.profile === 'OFF' ? 'disabled' : supportedFile(file) ? 'unprocessed' : 'unsupported', pages: [] };
    const requested = unit == null ? null : Number(unit);
    const pages = await prisma.$queryRaw`SELECT unit,source,reference,text,confidence,engine,wc AS "wordCount",
      CASE WHEN (${requested}::int IS NULL AND total<=${WORD_BUDGET}) OR unit=${requested}::int THEN words ELSE '[]'::jsonb END AS words,
      NOT ((${requested}::int IS NULL AND total<=${WORD_BUDGET}) OR unit=${requested}::int) AND wc>0 AS "wordsOmitted"
      FROM (SELECT p.*,jsonb_array_length(p.words) AS wc,sum(jsonb_array_length(p.words)) OVER (ORDER BY p.unit) AS total
        FROM runly_content.page p WHERE p.job_id=${job.id}::uuid) q ORDER BY unit`;
    return { ...job, pages, searchablePdf: await derivativeState(file) };
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
    const { normalized,terms,exact:tsquery,expanded } = searchQuery(q);
    if (!normalized) return { data: [], nextCursor: null };
    const cursorScope=hash(JSON.stringify([companyId,args.activeContext.profileId,normalized,query.searchIn]));
    const cursor=query.cursor?decodeCursor(query.cursor,cursorScope):null;
    const source = query.searchIn === 'ocr' ? 'ocr' : null;
    const folderId = query.folderId && query.folderId !== 'root' ? uuid.parse(query.folderId) : null;
    // Bounded candidates. Current ACL is still checked before returning any text.
    const candidates = await prisma.$queryRaw`WITH matches AS (
      SELECT j.file_id AS id,max(CASE WHEN p.normalized ~ ${`\\m${normalized.replace(/ /g,'\\s+')}\\M`} THEN 100
        WHEN p.search_vector @@ to_tsquery('simple',${tsquery}) THEN 80 ELSE 30 END)::int AS rank
      FROM runly_content.page p JOIN runly_content.job j ON j.id=p.job_id
      JOIN file_asset current ON current.id=j.file_id
      WHERE j.company_id=${companyId}::uuid AND current.enabled AND j.company_id=current.entity_id
        AND j.revision=current.content_revision AND j.object_key=current.object_key
        AND j.state IN ('done','partial','empty') AND (${source}::text IS NULL OR p.source=${source})
        AND p.search_vector @@ to_tsquery('simple',${expanded}) GROUP BY j.file_id
      UNION ALL
      SELECT id,90 AS rank FROM file_asset WHERE ${query.searchIn === 'all'} AND entity_id=${companyId}::uuid AND enabled
        AND lower(original_name) LIKE ${`%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`}
    ), ranked AS (SELECT id,max(rank)::int AS rank FROM matches GROUP BY id)
    SELECT f.id,ranked.rank FROM ranked JOIN file_asset f ON f.id=ranked.id
      WHERE f.entity_id=${companyId}::uuid AND f.enabled
      AND (${cursor?.id??null}::uuid IS NULL OR ranked.rank<${cursor?.rank??0} OR (ranked.rank=${cursor?.rank??0} AND f.id>${cursor?.id??null}::uuid))
      AND (${folderId}::uuid IS NULL OR f.folder_id=${folderId}::uuid)
      AND (${query.folderId !== 'root'} OR f.folder_id IS NULL)
      AND (${query.mime ?? ''}='' OR f.mime_type LIKE ${`${query.mime ?? ''}%`})
      AND (${query.moduleKey ?? ''}='' OR f.module_key=${query.moduleKey ?? ''})
      AND (${query.workspace !== 'mine'} OR f.uploaded_by_id=${args.activeContext.profileId}::uuid)
      AND (${query.workspace !== 'shared'} OR EXISTS(SELECT 1 FROM file_asset_share s WHERE s.file_id=f.id
        AND s.user_id=${args.activeContext.profileId}::uuid AND s.status='ACCEPTED'))
      ORDER BY ranked.rank DESC,f.id LIMIT 50`;
    const data = [];
    const recordFilter = query.record ? await recordFilesWhere(prisma, companyId, String(query.record)) : null;
    const candidatePages = candidates.length ? await prisma.$queryRaw`SELECT DISTINCT ON (j.file_id) j.file_id,p.unit,p.reference,p.source,p.text,
      p.search_vector @@ to_tsquery('simple',${tsquery}) AS exact FROM runly_content.page p
      JOIN runly_content.job j ON j.id=p.job_id JOIN file_asset f ON f.id=j.file_id
      WHERE j.file_id=ANY(${candidates.map(candidate=>candidate.id)}::uuid[]) AND f.enabled AND j.company_id=${companyId}::uuid
      AND j.revision=f.content_revision AND j.object_key=f.object_key AND j.state IN ('done','partial','empty')
      AND (${source}::text IS NULL OR p.source=${source}) AND p.search_vector @@ to_tsquery('simple',${expanded})
      ORDER BY j.file_id,exact DESC,p.unit` : [];
    const byFile = new Map(candidatePages.map(page=>[page.file_id,page]));
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
      const match = byFile.get(file.id);
      const at = match ? Math.max(0, normalizeText(match.text).indexOf(terms[0]) - 60) : 0;
      data.push({ ...file, contentMatch: match ? { source: match.source, page: match.unit, reference: match.reference, snippet: match.text.slice(at, at + 240), terms,
        approximate:!match.exact } : null });
    }
    // Never expose that a page of invisible candidates exists. Mixed-visibility
    // broad searches can be incomplete until visibility is pushed into ranking.
    return { data, nextCursor: data.length === 50 ? encodeCursor(candidates.at(-1),cursorScope) : null };
  }
  // Capped, cached count: never a full scan per dashboard refresh. `capped` means "at least this many".
  const eligibleCache = new Map();
  const SUPPORTED_SQL = String.raw`^(image/(jpeg|png|webp|tiff|heic|heif)|application/(pdf|json|xml|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text/[a-z.+-]+|image/svg\+xml)$`;
  async function eligible(companyId, filters = {}) {
    const key = `${companyId}:${JSON.stringify(filters)}`, hit = eligibleCache.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.value;
    const CAP = 50000;
    const [row] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM (SELECT 1 FROM file_asset WHERE entity_id=${companyId}::uuid AND enabled
      AND mime_type ~ ${SUPPORTED_SQL}
      AND (${filters.folderId ?? null}::uuid IS NULL OR folder_id=${filters.folderId ?? null}::uuid)
      AND (${filters.mime ?? null}::text IS NULL OR mime_type LIKE ${(filters.mime ?? '') + '%'})
      AND created_at>=coalesce(${filters.fromDate ?? null}::timestamp,'-infinity'::timestamp)
      AND created_at<=coalesce(${filters.toDate ?? null}::timestamp,'infinity'::timestamp) LIMIT ${CAP + 1}) s`;
    const value = { count: Math.min(row.n, CAP), capped: row.n > CAP };
    eligibleCache.set(key, { at: Date.now(), value });
    if (eligibleCache.size > 200) eligibleCache.delete(eligibleCache.keys().next().value);
    return value;
  }
  // Honest progress: null whenever the denominator is only a lower bound or the sample is too small.
  function historySummary(scan, total, rate) {
    if (!scan) return null;
    const known = total && !total.capped;
    const progress = known && total.count > 0 ? Math.min(1, scan.discovered / total.count) : null;
    const span = rate?.firstActivity && rate?.lastActivity ? (new Date(rate.lastActivity) - new Date(rate.firstActivity)) / 1000 : 0;
    const enough = rate?.completed >= 20 && span >= 60;
    const etaSeconds = scan.state === 'running' && known && enough ? Math.round(Math.max(0, total.count - scan.discovered) * span / rate.completed) : null;
    return { eligible: total?.count ?? null, eligibleCapped: Boolean(total?.capped), discovered: scan.discovered, enqueued: scan.enqueued, omitted: scan.omitted,
      progress, etaSeconds, etaNote: etaSeconds == null ? 'Sin datos suficientes para estimar' : 'Estimación según el ritmo de los últimos 15 minutos; no considera horarios ni pausas' };
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
      coalesce(sum(elapsed_ms),0)::int AS "elapsedMs",max(finished_at) AS "lastActivity",min(finished_at) AS "firstActivity"
      FROM (SELECT elapsed_ms,finished_at FROM runly_content.attempt WHERE finished_at>now()-interval '15 minutes'
        AND (${scope === 'instance'} OR company_id=${scope === 'instance' ? null : scope}::uuid) ORDER BY finished_at DESC LIMIT 1000) recent`;
    const backfill = await prisma.$queryRaw`SELECT company_id AS "companyId",kind,state,cursor,discovered,enqueued,omitted,updated_at AS "updatedAt" FROM runly_content.backfill
      WHERE (${scope === 'instance'} OR company_id=${scope === 'instance' ? null : scope}::uuid) ORDER BY updated_at DESC LIMIT 100`;
    const storage=scope==='instance'?await prisma.$queryRaw`SELECT coalesce(sum(pg_indexes_size(oid)),0)::float AS "indexBytes"
      FROM pg_class WHERE relnamespace='runly_content'::regnamespace AND relkind='r'`:[];
    const scan = scope === 'instance' ? null : backfill.find(item => item.kind === 'historical');
    const [scanRow] = scan ? await prisma.$queryRaw`SELECT filters FROM runly_content.backfill WHERE company_id=${scope}::uuid AND kind='historical'` : [];
    const history = scan ? historySummary(scan, await eligible(scope, scanRow?.filters ?? {}), rate) : null;
    const effectiveNow = local ? effectivePolicy(instance, local) : instance;
    return { config: local ?? instance, effective: effectiveNow, operational: operationalState(effectiveNow, workers),
      workers: scope === 'instance' ? workers : workers.map(w => ({ connected: w.connected, heartbeatAt: w.heartbeatAt,
        capabilities: { engine: w.capabilities.engine, languages: w.capabilities.languages, models: w.capabilities.models, protocol: w.capabilities.protocol } })),
      counts, recent, rate, backfill, history, engine: ENGINE_VERSION,
      ...(scope==='instance' ? { pressure: await pressure.observe(),indexBytes:storage[0].indexBytes } : {}) };
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
      if (maintenance.length) await cleanStaleDerivatives(db);
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
        const effectiveMemoryMiB = Math.min(p.memoryMiB,Math.floor((worker.capabilities.memoryLimit ?? 0)*0.85/1048576));
        if (effectiveMemoryMiB<minimumMiB) {
          await db.$executeRaw`UPDATE runly_content.job SET state='failed',error_code='RESOURCES',updated_at=now() WHERE id=${job.id}::uuid`;
          continue;
        }
        const [companyActive] = await db.$queryRaw`SELECT count(*)::int AS n FROM runly_content.job WHERE company_id=${job.company_id}::uuid AND state='processing'`;
        if (companyActive.n >= p.concurrency) continue;
        const lease = randomBytes(32).toString('hex');
        const snapshot = { ...p,memoryMiB:effectiveMemoryMiB,threads:Math.min(p.threads,Math.max(1,Math.ceil(worker.capabilities.cpuLimit??1))),
          quality: job.quality, allowOcr: p.automaticOcr || (job.manual && p.manualOcr) };
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
    return storedStream(job.bucket, job.object_key, job.size_bytes, p.maxFileBytes);
  }
  // Bounded stream of a stored object: even incorrect object metadata cannot make the API buffer an oversized file.
  async function storedStream(bucket, objectKey, sizeBytes, maxBytes) {
    if (sizeBytes > maxBytes) throw new ContentError('Archivo excesivo.', 413);
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(objectKey, 60);
    if (error || !data?.signedUrl) throw new ContentError('No se pudo leer el original.', 422);
    const response = await fetch(toInternalSupabaseUrl(data.signedUrl), { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new ContentError('No se pudo leer el original.', 422);
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body.cancel();
      throw new ContentError('Archivo excesivo.', 413);
    }
    const reader = response.body.getReader();
    let received = 0;
    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          received += value.byteLength;
          if (received > maxBytes) { await reader.cancel(); controller.error(new Error('LIMIT')); return; }
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
  // Explicit, separate from disabling OCR or search. Deletes derived data only, in bounded batches
  // (pages cascade from jobs); originals in file_asset/Storage are never touched.
  async function purge(companyId, context) {
    await prisma.$transaction(async db => {
      await db.$executeRaw`UPDATE runly_content.backfill SET state='cancelled',updated_at=now() WHERE company_id=${companyId}::uuid`;
      await audit(db, context, 'purge.start', {});
    });
    let removed = 0;
    for (;;) {
      const n = await prisma.$executeRaw`DELETE FROM runly_content.job WHERE id IN (SELECT id FROM runly_content.job WHERE company_id=${companyId}::uuid LIMIT 500)`;
      removed += n;
      if (n < 500) break;
    }
    const removedDerivatives = await removeDerivatives(prisma, companyId);
    await prisma.$transaction(db => audit(db, context, 'purge.done', { removedJobs: removed, removedDerivatives }));
    return { ok: true, removedJobs: removed, removedDerivatives };
  }

  // ---- Searchable PDF derivatives ------------------------------------------------------------------------------
  // An independent, optional copy of a PDF with an invisible recognized-text layer. Generated asynchronously by the worker
  // from the stored OCR result; the original is never modified and the copy dies with its file revision.
  const DERIVATIVE_MAX_BYTES = 64 * 1048576, DERIVATIVE_COMPANY_QUEUE = 5;
  async function derivativeState(file) {
    const [row] = await prisma.$queryRaw`SELECT state,error_code AS "errorCode",size_bytes::float AS "sizeBytes",pages,ocr_pages AS "ocrPages",signed,
      finished_at AS "finishedAt",updated_at AS "updatedAt" FROM runly_content.derivative
      WHERE file_id=${file.id}::uuid AND revision=${file.contentRevision} AND object_key=${file.objectKey} AND kind='searchable-pdf'`;
    return row ?? null;
  }
  async function requestSearchable(args) {
    const file = await authorized(args);
    if (file.mimeType !== 'application/pdf') throw new ContentError('Solo un PDF puede generar una copia con texto reconocido.', 415);
    const p = await effective(file.entityId);
    if (p.profile === 'OFF' || p.paused || !p.manualOcr || !p.pdfOcr) throw new ContentError('El procesamiento de contenido está desactivado para esta empresa.', 409);
    if (file.sizeBytes > p.maxFileBytes) throw new ContentError('El archivo supera el límite de procesamiento.', 413);
    const existing = await derivativeState(file);
    if (existing && ['pending', 'processing', 'done'].includes(existing.state)) return existing;
    const [job] = await prisma.$queryRaw`SELECT state FROM runly_content.job WHERE file_id=${file.id}::uuid AND company_id=${file.entityId}::uuid
      AND revision=${file.contentRevision} AND object_key=${file.objectKey}`;
    if (!job || !['done', 'partial'].includes(job.state)) throw new ContentError('Primero procesa el archivo para reconocer su texto.', 409);
    const [scanned] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM runly_content.page p JOIN runly_content.job j ON j.id=p.job_id
      WHERE j.file_id=${file.id}::uuid AND j.revision=${file.contentRevision} AND j.object_key=${file.objectKey} AND p.source='ocr' AND jsonb_array_length(p.words)>0`;
    if (!scanned.n) throw new ContentError('Este PDF ya tiene texto seleccionable o no se reconoció texto: no necesita una copia.', 409);
    const rows = await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(71620381)::text`;
      return db.$queryRaw`INSERT INTO runly_content.derivative(company_id,file_id,revision,object_key,requested_by)
        SELECT ${file.entityId}::uuid,${file.id}::uuid,${file.contentRevision},${file.objectKey},${args.activeContext.profileId ?? null}::uuid
        WHERE (SELECT count(*) FROM runly_content.derivative WHERE company_id=${file.entityId}::uuid AND state IN ('pending','processing'))<${DERIVATIVE_COMPANY_QUEUE}
        ON CONFLICT (file_id,revision,kind) DO UPDATE SET state='pending',error_code=NULL,attempts=0,object_key=EXCLUDED.object_key,storage_key=NULL,
          size_bytes=NULL,finished_at=NULL,updated_at=now() WHERE runly_content.derivative.state IN ('failed','cancelled')
        RETURNING id`;
    });
    if (!rows.length) throw new ContentError('Hay demasiadas copias en preparación. Inténtalo de nuevo en unos minutos.', 409);
    return derivativeState(file);
  }
  async function searchableDownload(args) {
    const file = await authorized(args);
    const [row] = await prisma.$queryRaw`SELECT storage_key FROM runly_content.derivative WHERE file_id=${file.id}::uuid AND revision=${file.contentRevision}
      AND object_key=${file.objectKey} AND kind='searchable-pdf' AND state='done' AND storage_key IS NOT NULL`;
    if (!row) throw new ContentError('Aún no hay una copia con texto reconocido.', 404);
    const name = `${file.originalName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').slice(0, 120)} (texto reconocido).pdf`;
    const { data, error } = await supabaseAdmin.storage.from(file.bucket).createSignedUrl(row.storage_key, 60, { download: name });
    if (error || !data?.signedUrl) throw new ContentError('No se pudo preparar la descarga.', 422);
    return { url: data.signedUrl, name, expiresInSeconds: 60 };
  }
  async function removeDerivatives(db, companyId) {
    let total = 0;
    for (;;) {
      const rows = await db.$queryRaw`SELECT d.id,d.storage_key,f.bucket FROM runly_content.derivative d JOIN file_asset f ON f.id=d.file_id
        WHERE d.company_id=${companyId}::uuid LIMIT 200`;
      if (!rows.length) return total;
      for (const row of rows) if (row.storage_key) await supabaseAdmin.storage.from(row.bucket).remove([row.storage_key]).catch(() => null);
      await db.$executeRaw`DELETE FROM runly_content.derivative WHERE id=ANY(${rows.map(row => row.id)}::uuid[])`;
      total += rows.length;
    }
  }
  // A derivative belongs to one file revision: replaced, disabled or deleted originals leave nothing servable behind.
  async function cleanStaleDerivatives(db) {
    const rows = await db.$queryRaw`SELECT d.id,d.storage_key,d.bucket FROM (SELECT d.id,d.storage_key,f.bucket FROM runly_content.derivative d JOIN file_asset f ON f.id=d.file_id
      WHERE d.state<>'processing' AND (NOT f.enabled OR f.content_revision<>d.revision OR f.object_key<>d.object_key) LIMIT 50) d`;
    for (const row of rows) if (row.storage_key) await supabaseAdmin.storage.from(row.bucket).remove([row.storage_key]).catch(() => null);
    if (rows.length) await db.$executeRaw`DELETE FROM runly_content.derivative WHERE id=ANY(${rows.map(row => row.id)}::uuid[])`;
  }
  async function claimDerivative(workerId) {
    if ((await pressure.observe()).paused) return null;
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(71620381)::text`;
      const global = policySchema.parse(await policy('instance', db));
      if (global.profile === 'OFF' || global.paused) return null;
      const [worker] = await db.$queryRaw`SELECT id,capabilities FROM runly_content.worker WHERE id=${workerId}
        AND heartbeat_at>now()-interval '90 seconds' AND capabilities->>'governor'='ready' AND coalesce((capabilities->>'protocol')::int,1)>=2`;
      if (!worker) return null;
      await db.$executeRaw`UPDATE runly_content.derivative SET state=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END,lease_hash=NULL,lease_until=NULL,
        error_code='LEASE_EXPIRED',updated_at=now() WHERE state='processing' AND lease_until<now()`;
      const [active] = await db.$queryRaw`SELECT ((SELECT count(*) FROM runly_content.job WHERE state='processing')
        +(SELECT count(*) FROM runly_content.derivative WHERE state='processing'))::int AS n`;
      if (active.n >= global.concurrency) return null;
      const rows = await db.$queryRaw`SELECT d.* FROM runly_content.derivative d JOIN company c ON c.id=d.company_id AND c.enabled
        WHERE d.state='pending' ORDER BY d.created_at LIMIT 10 FOR UPDATE OF d SKIP LOCKED`;
      for (const row of rows) {
        const p = await effective(row.company_id, db);
        const file = await db.fileAsset.findFirst({ where: { id: row.file_id, entityId: row.company_id, enabled: true, contentRevision: row.revision, objectKey: row.object_key } });
        if (!file) { await db.$executeRaw`DELETE FROM runly_content.derivative WHERE id=${row.id}::uuid`; continue; }
        if (p.profile === 'OFF' || p.paused || !p.manualOcr || !p.pdfOcr || file.sizeBytes > p.maxFileBytes || !p.schedules.every(schedule => withinSchedule(schedule))) continue;
        const effectiveMemoryMiB = Math.min(p.memoryMiB, Math.floor((worker.capabilities.memoryLimit ?? 0) * 0.85 / 1048576));
        if (effectiveMemoryMiB < 384) {
          await db.$executeRaw`UPDATE runly_content.derivative SET state='failed',error_code='RESOURCES',updated_at=now(),finished_at=now() WHERE id=${row.id}::uuid`;
          continue;
        }
        const lease = randomBytes(32).toString('hex');
        const snapshot = { ...p, memoryMiB: effectiveMemoryMiB, threads: Math.min(p.threads, Math.max(1, Math.ceil(worker.capabilities.cpuLimit ?? 1))), quality: 'balanced', allowOcr: true };
        await db.$executeRaw`UPDATE runly_content.derivative SET state='processing',attempts=attempts+1,worker_id=${workerId},lease_hash=${hash(lease)},
          lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=${row.id}::uuid`;
        return { id: row.id, route: 'derivatives', kind: 'searchable-pdf', lease, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, policy: snapshot, engine: ENGINE_VERSION };
      }
      return null;
    }, { timeout: 15000 });
  }
  async function leasedDerivative(db, id, lease) {
    uuid.parse(id);
    if (typeof lease !== 'string' || lease.length !== 64) throw new ContentError('Lease inválido.', 409);
    const [row] = await db.$queryRaw`SELECT d.*,f.bucket,f.size_bytes AS source_bytes FROM runly_content.derivative d JOIN file_asset f ON f.id=d.file_id
      WHERE d.id=${id}::uuid AND d.lease_hash=${hash(lease)} AND d.state='processing' AND d.lease_until>now()
      AND f.enabled AND f.entity_id=d.company_id AND f.content_revision=d.revision AND f.object_key=d.object_key FOR UPDATE OF d`;
    if (!row) throw new ContentError('El trabajo ya no está autorizado.', 409);
    const p = await effective(row.company_id, db);
    if (p.profile === 'OFF' || p.paused) throw new ContentError('Procesamiento detenido.', 409);
    return { row, p };
  }
  async function derivativeSource(id, lease) {
    const { row, p } = await prisma.$transaction(db => leasedDerivative(db, id, lease));
    return storedStream(row.bucket, row.object_key, row.source_bytes, p.maxFileBytes);
  }
  // The worker reads the stored OCR (words per page) instead of recognizing again: reuse is the default, never a second OCR pass.
  async function derivativePages(id, lease) {
    const { row } = await prisma.$transaction(db => leasedDerivative(db, id, lease));
    const pages = await prisma.$queryRaw`SELECT p.unit,p.words,p.source,p.engine->'canvas' AS canvas FROM runly_content.page p JOIN runly_content.job j ON j.id=p.job_id
      WHERE j.file_id=${row.file_id}::uuid AND j.revision=${row.revision} AND j.object_key=${row.object_key} ORDER BY p.unit`;
    return { pages };
  }
  async function derivativeRenew(id, lease) {
    return prisma.$transaction(async db => {
      await leasedDerivative(db, id, lease);
      await db.$executeRaw`UPDATE runly_content.derivative SET lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=${id}::uuid`;
      return { ok: true };
    });
  }
  async function derivativeUpload(id, lease, bytes) {
    const { row, p } = await prisma.$transaction(db => leasedDerivative(db, id, lease));
    const ceiling = Math.min(DERIVATIVE_MAX_BYTES, p.maxFileBytes * 4);
    if (!bytes?.byteLength || bytes.byteLength > ceiling || Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') throw new ContentError('La copia generada no es válida.', 422);
    const key = `content-derivatives/${row.company_id}/${row.file_id}/${row.revision}.pdf`;
    const { error } = await supabaseAdmin.storage.from(row.bucket).upload(key, bytes, { contentType: 'application/pdf', upsert: true });
    if (error) throw new ContentError('No se pudo guardar la copia.', 422);
    await prisma.$executeRaw`UPDATE runly_content.derivative SET storage_key=${key},size_bytes=${bytes.byteLength},updated_at=now() WHERE id=${id}::uuid`;
    return { ok: true };
  }
  async function derivativeComplete(id, lease, body) {
    const input = z.strictObject({ errorCode: z.enum(['UNSUPPORTED', 'LIMIT', 'TIMEOUT', 'PARSER', 'DOWNLOAD', 'RESOURCES', 'ENCRYPTED', 'NOT_NEEDED']).optional(),
      pages: z.number().int().min(0).max(200).default(0), ocrPages: z.number().int().min(0).max(200).default(0), signed: z.boolean().default(false),
      engine: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).default({}) }).parse(body);
    return prisma.$transaction(async db => {
      const { row } = await leasedDerivative(db, id, lease);
      if (input.errorCode || !row.storage_key) {
        if (row.storage_key) await supabaseAdmin.storage.from(row.bucket).remove([row.storage_key]).catch(() => null);
        await db.$executeRaw`UPDATE runly_content.derivative SET state='failed',error_code=${input.errorCode ?? 'PARSER'},storage_key=NULL,size_bytes=NULL,lease_hash=NULL,lease_until=NULL,
          updated_at=now(),finished_at=now() WHERE id=${id}::uuid`;
        return { ok: true, state: 'failed' };
      }
      await db.$executeRaw`UPDATE runly_content.derivative SET state='done',error_code=NULL,pages=${input.pages},ocr_pages=${input.ocrPages},signed=${input.signed},
        engine=${JSON.stringify({ ...input.engine, version: ENGINE_VERSION })}::jsonb,lease_hash=NULL,lease_until=NULL,updated_at=now(),finished_at=now() WHERE id=${id}::uuid`;
      return { ok: true, state: 'done' };
    });
  }
  return { policy, effective, savePolicy, request, result, cancel, search, status, backfill, heartbeat, claim, renew, download, checkpoint, complete, purge,
    requestSearchable, searchableDownload, claimDerivative, derivativeSource, derivativePages, derivativeRenew, derivativeUpload, derivativeComplete };
}
