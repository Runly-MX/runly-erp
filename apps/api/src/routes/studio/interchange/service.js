import { z } from 'zod'
import { StudioError, FILE_ID } from '../../../../../shared/studio/document.js'
import { studioAssetIds } from '../studio-document-data.js'
import { checkAbort } from '../../../../../shared/studio/abort.js'
import { documentPages } from '../../../../../shared/studio/pages.js'
import { exportNativePackage, inspectNativePackage, mapReferences, renameContent, hash } from './package.js'
import { importSvgPage } from './svg.js'

const optionsSchema = z.strictObject({ target: z.enum(['design','personal','company']), name: z.string().trim().min(1).max(160) })
const confirmationSchema = z.strictObject({ digest: z.string().regex(/^[a-f0-9]{64}$/), acceptWarnings: z.boolean().default(false) })
const unknownLicense = { id: 'unspecified', author: '', notice: '', redistribution: 'unknown' }

export function createStudioInterchange({ prisma, filesService, supabaseAdmin, designs, templates }) {
  const access = designs.access
  const missing = () => { throw new StudioError('Importación no encontrada.', 404) }
  let sweeping = false, timer, processing = 0
  async function withCapacity(task) {
    if (processing >= 2) throw new StudioError('Hay paquetes procesándose. Reintenta.', 429)
    processing++
    try { return await task() } finally { processing-- }
  }
  const targetPermission = target => target === 'company' ? 'studio.templates.publish' : target === 'personal' ? 'studio.templates.manage' : 'studio.create'
  async function authorize(companyId, actorId, target, db = prisma) {
    await access.member(companyId, actorId, 'studio.view', db)
    await access.member(companyId, actorId, targetPermission(target), db)
  }
  async function find(companyId, actorId, id, db = prisma, lock = false) {
    access.identity(companyId, actorId); if (!FILE_ID.test(id)) return missing()
    const rows = lock ? await db.$queryRaw`SELECT * FROM studio_interchange_job WHERE id=${id}::uuid AND company_id=${companyId}::uuid AND actor_id=${actorId}::uuid FOR UPDATE`
      : await db.$queryRaw`SELECT * FROM studio_interchange_job WHERE id=${id}::uuid AND company_id=${companyId}::uuid AND actor_id=${actorId}::uuid`
    if (!rows[0]) return missing(); return rows[0]
  }
  async function decode(bytes, mime) {
    if (mime === 'image/svg+xml') {
      const svg = importSvgPage(bytes)
      const bundle = await exportNativePackage({ document: svg.document, title: 'SVG importado', provenance: svg.provenance, losses: svg.warnings })
      const decoded = await inspectNativePackage(bundle)
      decoded.originalSvg = svg.original; decoded.digest = hash(bytes)
      return decoded
    }
    if (mime !== 'application/vnd.runly.studio+zip') throw new StudioError('Selecciona .runlystudio o SVG; MIME no compatible.', 415)
    return inspectNativePackage(bytes)
  }
  async function inspect(bytes, mime) {
    try { const data = await decode(bytes, mime); return { ...data.report, digest: data.digest, ...(mime === 'image/svg+xml' ? { adapter: 'svg-subset-v1' } : {}) } }
    catch (error) { if (error instanceof StudioError) return { pages: [], resources: [], fonts: [], warnings: [], preview: null, blockingErrors: [error.message], ...(error.details ?? {}) }; throw error }
  }
  const report = row => ({ id: row.id, state: row.state, target: row.target, name: row.name, digest: row.digest, expiresAt: row.expires_at, resources: row.manifest.manifest.resources, notices: row.manifest.manifest.notices, ...row.manifest.report, ...(row.result ? { result: row.result } : {}) })

  // Compensation uses only keys journaled by the trusted Files hook, never
  // caller-supplied paths. No FileAsset exists before the final DB transaction.
  async function compensate(id, expiredOnly = false) {
    const [row] = await prisma.$queryRaw`UPDATE studio_interchange_job SET state='cleanup',document=NULL,lease_until=now()+interval '2 minutes'
      WHERE id=${id}::uuid AND state IN ('cleanup','cancelled','ready','preparing')
      AND (NOT ${expiredOnly} OR (next_cleanup_at<=now() AND lease_until<=now())) RETURNING *`
    if (!row) return
    for (const asset of row.staged) {
      const { error } = await supabaseAdmin.storage.from(asset.bucket).remove([asset.objectKey])
      if (error) { await prisma.$queryRaw`UPDATE studio_interchange_job SET next_cleanup_at=now()+interval '1 minute',lease_until=now() WHERE id=${id}::uuid AND state='cleanup' RETURNING id`; throw new StudioError('La limpieza queda pendiente y se reintentará.', 503, 'STUDIO_IMPORT_CLEANUP_PENDING') }
    }
    // Retain tombstones and keys, retrying for a day to cover late Storage I/O.
    await prisma.$queryRaw`UPDATE studio_interchange_job SET state='cancelled',lease_until=now(),next_cleanup_at=CASE WHEN created_at>now()-interval '1 day' THEN now()+interval '5 minutes' ELSE NULL END
      WHERE id=${id}::uuid AND state='cleanup' RETURNING id`
  }
  async function recoverExpired() {
    if (sweeping) return; sweeping = true
    try {
      const rows = await prisma.$queryRaw`SELECT id FROM studio_interchange_job WHERE state IN ('preparing','ready','cleanup','cancelled') AND next_cleanup_at<=now() AND lease_until<=now() ORDER BY next_cleanup_at LIMIT 32`
      for (const row of rows) await compensate(row.id, true).catch(() => {})
    } finally { sweeping = false }
  }
  function startCleanup() { if (!timer) { timer = setInterval(() => { void recoverExpired().catch(() => {}) }, 60000); timer.unref?.() } }
  async function prepare(companyId, actorId, bytes, mime, input, context, signal) {
    const options = optionsSchema.parse(input); await authorize(companyId, actorId, options.target)
    const data = await decode(bytes, mime); checkAbort(signal)
    const resources = data.manifest.resources, reserved = resources.reduce((n, r) => n + r.bytes, 0)
    if (reserved > 64 * 1024 * 1024) throw new StudioError('Los recursos superan 64 MiB.', 413)
    if (resources.length) await access.member(companyId, actorId, 'files.assets.create')
    const licenseFiles = Object.fromEntries(data.manifest.licenses.map(entry => [entry.path, data.files.get(entry.path).toString('utf8')]))
    if (data.originalSvg) licenseFiles['licenses/original-svg.txt'] = data.originalSvg
    const { resources: _resources, notices: _notices, ...summary } = data.report
    const meta = { manifest: data.manifest, report: summary, licenseFiles }
    if (Buffer.byteLength(JSON.stringify(meta)) > 10 * 1024 * 1024) throw new StudioError('Los metadatos y licencias superan 10 MiB.', 413)
    const row = await prisma.$transaction(async db => {
      await access.lock(db); await authorize(companyId, actorId, options.target, db)
      const [quota] = await db.$queryRaw`SELECT count(*) FILTER (WHERE state IN ('preparing','ready','cleanup'))::int AS active,
        count(*) FILTER (WHERE state IN ('preparing','ready','cleanup') AND actor_id=${actorId}::uuid)::int AS own,
        COALESCE(sum(reserved_bytes) FILTER (WHERE state IN ('preparing','ready','cleanup')),0)::bigint AS bytes,
        count(*) FILTER (WHERE created_at>now()-interval '1 hour' AND actor_id=${actorId}::uuid)::int AS rate
        FROM studio_interchange_job WHERE company_id=${companyId}::uuid AND
        (state IN ('preparing','ready','cleanup') OR (actor_id=${actorId}::uuid AND created_at>now()-interval '1 hour'))`
      if (quota.active >= 4 || quota.own >= 2 || Number(quota.bytes) + reserved > 128 * 1024 * 1024 || quota.rate >= 20) throw new StudioError('Se alcanzó la cuota de importaciones. Confirma o cancela las pendientes.', 429, 'STUDIO_IMPORT_QUOTA')
      const [job] = await db.$queryRaw`INSERT INTO studio_interchange_job(company_id,actor_id,target,name,digest,reserved_bytes,document,manifest)
        VALUES(${companyId}::uuid,${actorId}::uuid,${options.target},${options.name},${data.digest},${reserved},${JSON.stringify(data.portable)}::jsonb,${JSON.stringify(meta)}::jsonb) RETURNING *`
      return job
    })
    const staged = []
    const heartbeat = setInterval(() => { void prisma.$queryRaw`UPDATE studio_interchange_job SET lease_until=now()+interval '2 minutes' WHERE id=${row.id}::uuid AND state='preparing' RETURNING id`.catch(() => {}) }, 30000); heartbeat.unref?.()
    try {
      for (const resource of resources) {
        checkAbort(signal); await authorize(companyId, actorId, options.target); await access.member(companyId, actorId, 'files.assets.create')
        let intent
        const result = await filesService.upload({ ...context, file: new File([data.files.get(resource.path)], resource.path.split('/').at(-1), { type: resource.mime }),
          fields: { moduleKey: 'runly.files', entityType: 'AtlasFile', visibility: 'PRIVATE', metadata: { studioInterchange: { digest: row.digest, license: resource.license, verified: false } } },
          staging: { beforeStorage: async location => {
            intent = { resourceId: resource.id, ...location }
            staged.push(intent)
            const changed = await prisma.$queryRaw`UPDATE studio_interchange_job SET staged=${JSON.stringify(staged)}::jsonb,lease_until=now()+interval '2 minutes' WHERE id=${row.id}::uuid AND state='preparing' RETURNING id`
            if (!changed.length) throw new StudioError('La importación fue cancelada.', 409)
          } } })
        if (!intent || !result.staged || result.staged.entityId !== companyId || result.staged.uploadedById !== actorId || result.staged.visibility !== 'PRIVATE') throw new StudioError('Files no admite staging seguro.', 503)
        intent.data = result.staged
        const saved = await prisma.$queryRaw`UPDATE studio_interchange_job SET staged=${JSON.stringify(staged)}::jsonb WHERE id=${row.id}::uuid AND state='preparing' RETURNING id`
        if (!saved.length) throw new StudioError('La importación fue cancelada.', 409)
      }
      checkAbort(signal); await authorize(companyId, actorId, options.target)
      const [ready] = await prisma.$queryRaw`UPDATE studio_interchange_job SET state='ready',lease_until=now(),next_cleanup_at=expires_at WHERE id=${row.id}::uuid AND state='preparing' RETURNING *`
      if (!ready) throw new StudioError('La importación fue cancelada.', 409)
      return report(ready)
    } catch (error) { await compensate(row.id).catch(() => {}); throw error }
    finally { clearInterval(heartbeat) }
  }
  async function status(companyId, actorId, id) { const row = await find(companyId, actorId, id); await authorize(companyId, actorId, row.target); return report(row) }
  async function previewAsset(companyId, actorId, id, resourceId, signal) {
    const row = await find(companyId, actorId, id); await authorize(companyId, actorId, row.target)
    const resource = row.manifest.manifest.resources.find(r => r.id === resourceId), staged = row.staged.find(r => r.resourceId === resourceId)
    if (row.state !== 'ready' || new Date(row.expires_at).getTime() <= Date.now() || !resource || !staged) throw new StudioError('Previsualización no disponible.', 404)
    checkAbort(signal)
    const { data, error } = await supabaseAdmin.storage.from(staged.bucket).download(staged.objectKey)
    if (error || !data || data.size > 10 * 1024 * 1024) throw new StudioError('Previsualización no disponible.', 404)
    const bytes = Buffer.from(await data.arrayBuffer())
    if (hash(bytes) !== resource.sha256) throw new StudioError('El recurso preparado cambió.', 409)
    const fresh = await find(companyId, actorId, id); await authorize(companyId, actorId, fresh.target); checkAbort(signal)
    if (fresh.state !== 'ready' || new Date(fresh.expires_at).getTime() <= Date.now()) throw new StudioError('La preparación ya no está disponible.', 409)
    return { bytes, mime: resource.mime }
  }
  async function confirm(companyId, actorId, id, input, context, signal) {
    const confirmation = confirmationSchema.parse(input)
    checkAbort(signal)
    const prepared = await find(companyId, actorId, id)
    await authorize(companyId, actorId, prepared.target)
    if (prepared.state === 'ready') for (const asset of prepared.staged) {
      checkAbort(signal)
      const { data, error } = await supabaseAdmin.storage.from(asset.bucket).download(asset.objectKey)
      if (error || !data || data.size > 10 * 1024 * 1024 || `asset-${hash(Buffer.from(await data.arrayBuffer()))}` !== asset.resourceId) throw new StudioError('El recurso preparado ya no está disponible o cambió.', 409)
    }
    const result = await prisma.$transaction(async db => {
      await access.lock(db)
      const row = await find(companyId, actorId, id, db, true)
      await authorize(companyId, actorId, row.target, db)
      if (row.digest !== confirmation.digest) throw new StudioError('La inspección no corresponde a este archivo.', 409)
      if (row.state === 'committed') {
        if (row.result.kind === 'design') await designs.get(companyId, actorId, row.result.id, db)
        else await templates.get(companyId, actorId, row.result.id, db)
        return row.result
      }
      if (row.state !== 'ready' || new Date(row.expires_at).getTime() <= Date.now()) throw new StudioError('La preparación caducó o no está lista.', 409)
      if (row.manifest.report.warnings.length && !confirmation.acceptWarnings) throw new StudioError('Revisa y acepta las advertencias antes de confirmar.', 409, 'STUDIO_IMPORT_REVIEW_REQUIRED')
      if (row.staged.length) await access.member(companyId, actorId, 'files.assets.create', db)
      const mapping = new Map()
      for (const asset of row.staged) {
        const data = asset.data
        if (!data || data.entityId !== companyId || data.uploadedById !== actorId || data.bucket !== asset.bucket || data.objectKey !== asset.objectKey) throw new StudioError('El staging está incompleto.', 409)
        const file = await db.fileAsset.create({ data }); mapping.set(asset.resourceId, file.id)
      }
      const document = renameContent(mapReferences(row.document, key => { if (!mapping.has(key)) throw new StudioError('Falta una imagen preparada.', 409); return mapping.get(key) }), `i-${row.id}`)
      const originalIds = documentPages(row.document).flatMap(s => s.objects.map(o => o.id)), currentIds = documentPages(document).flatMap(s => s.objects.map(o => o.id))
      const noticeIdMap = Object.fromEntries(originalIds.map((key, i) => [key, currentIds[i]]))
      checkAbort(signal)
      const saved = row.target === 'design' ? await designs.create(companyId, actorId, { name: row.name, document }, context, db)
        : await templates.create(companyId, actorId, { name: row.name, document, scope: row.target }, context, 'user', db)
      const output = { id: saved.id, kind: row.target === 'design' ? 'design' : 'template', scope: row.target, revision: saved.revision }
      await db.$queryRaw`UPDATE studio_interchange_job SET state='committed',result=${JSON.stringify(output)}::jsonb,manifest=${JSON.stringify({ ...row.manifest, noticeIdMap })}::jsonb,document=NULL,next_cleanup_at=NULL WHERE id=${id}::uuid RETURNING id`
      return output
    })
    return result
  }
  async function cancel(companyId, actorId, id) {
    const row = await find(companyId, actorId, id)
    if (row.state === 'committed') throw new StudioError('La importación ya fue confirmada.', 409)
    await compensate(row.id); return { cancelled: true }
  }
  async function recover(companyId, actorId) {
    await access.member(companyId, actorId)
    const rows = await prisma.$queryRaw`SELECT id FROM studio_interchange_job WHERE company_id=${companyId}::uuid AND actor_id=${actorId}::uuid AND state IN ('cleanup','cancelled') LIMIT 32`
    for (const row of rows) await compensate(row.id)
    return { recovered: rows.length }
  }
  async function exportPackage(companyId, actorId, kind, id, input, context, signal) {
    const options = z.strictObject({ acknowledgeImageCopies: z.literal(true) }).parse(input)
    void options
    const read = () => kind === 'template' ? templates.get(companyId, actorId, id) : designs.get(companyId, actorId, id)
    const initial = await read(), signature = hash(Buffer.from(JSON.stringify(initial.document)))
    const fresh = async () => {
      checkAbort(signal); await access.member(companyId, actorId)
      const now = await read()
      if (now.revision !== initial.revision || hash(Buffer.from(JSON.stringify(now.document))) !== signature) throw new StudioError('El origen cambió durante la exportación.', 409)
      return now
    }
    const rows = await prisma.$queryRaw`SELECT manifest FROM studio_interchange_job WHERE company_id=${companyId}::uuid AND state='committed' AND result->>'id'=${id} ORDER BY created_at DESC LIMIT 1`
    const prior = rows[0]?.manifest
    const notices = structuredClone(prior?.manifest?.notices ?? []).map(n => ({ ...n, subject: prior?.noticeIdMap?.[n.subject] ?? n.subject }))
    const bytes = await exportNativePackage({ document: initial.document, kind, title: initial.name, author: prior?.manifest?.author ?? '', provenance: prior?.manifest?.provenance ?? '', notices, licenseFiles: prior?.licenseFiles ?? {},
      readAsset: async fileId => {
        await fresh(); await access.member(companyId, actorId, 'files.assets.read')
        if (!studioAssetIds(initial.document).includes(fileId)) throw new StudioError('Recurso no autorizado.', 403)
        if (kind !== 'template') await access.assets(prisma, companyId, actorId, initial.document, id, context)
        const file = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: companyId, enabled: true } })
        if (!file || Number(file.sizeBytes) > 10 * 1024 * 1024) throw new StudioError('Recurso no disponible.', 403)
        const { data, error } = await supabaseAdmin.storage.from(file.bucket).download(file.objectKey)
        if (error || !data || data.size > 10 * 1024 * 1024) throw new StudioError('No se pudo descargar el recurso.', 503)
        const content = Buffer.from(await data.arrayBuffer())
        await fresh()
        if (!await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: companyId, enabled: true, bucket: file.bucket, objectKey: file.objectKey } })) throw new StudioError('El recurso dejó de estar disponible.', 403)
        const source = file.metadata?.studioSource
        const notice = source?.provider === 'openverse' ? {
          id: String(source.license ?? 'unspecified').slice(0,120), author: String(source.author ?? '').slice(0,2000), redistribution: 'unknown',
          notice: `${String(source.title ?? '').slice(0,1000)}. Openverse${FILE_ID.test(source.id ?? '') ? ` https://openverse.org/image/${source.id}` : ''}. Derechos declarados, no verificados.`,
        } : unknownLicense
        return { bytes: content, mime: file.mimeType, license: file.metadata?.studioInterchange?.license ?? notice }
      } })
    await fresh(); return bytes
  }
  return { inspect, prepare, confirm, status, previewAsset, cancel, recover, recoverExpired, startCleanup, exportPackage, withCapacity, close: () => clearInterval(timer) }
}
