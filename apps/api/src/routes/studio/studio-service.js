import { StudioError, validateDocument } from '../../../../shared/studio/document.js'
import { createStudioAccess } from './studio-access.js'
import { applyOps, checkOps, diffOps } from '../../../../shared/studio/operations.js'
import { createHash } from 'node:crypto'

export function createStudioService({ prisma, filesService, broadcaster }) {
  const access = createStudioAccess({ prisma, filesService })
  async function list(companyId, actorId, { page = 1, shared = 'all', q = '' } = {}) {
    await access.member(companyId, actorId)
    const offset = (Math.max(1, Math.min(10000, Number.parseInt(page, 10) || 1)) - 1) * 24
    const search = `%${String(q ?? '').trim().slice(0, 80).replace(/[\\%_]/g, character => `\\${character}`)}%`
    // `preview` is a bounded projection (page + first 40 objects, short text) so the
    // home renders vector thumbnails without shipping whole documents.
    return prisma.$queryRaw`SELECT d.id,d.name,d.revision,d.owner_id AS "ownerId",u.display_name AS "ownerName",d.updated_at AS "updatedAt",
      CASE WHEN d.owner_id=${actorId}::uuid THEN 'OWNER' ELSE c.role END AS role,
      jsonb_array_length(d.document->'objects')::int AS "objectCount",
      jsonb_build_object('page', d.document->'page', 'objects', COALESCE((SELECT jsonb_agg(CASE WHEN o.value->>'type'='text'
        THEN o.value || jsonb_build_object('text', left(o.value->>'text', 120)) ELSE o.value END ORDER BY o.ordinality)
        FROM jsonb_array_elements(d.document->'objects') WITH ORDINALITY o WHERE o.ordinality <= 40), '[]'::jsonb)) AS preview
      FROM studio_design d
      JOIN user_profile u ON u.id=d.owner_id LEFT JOIN studio_collaborator c ON c.design_id=d.id AND c.user_id=${actorId}::uuid
      WHERE d.company_id=${companyId}::uuid AND runly_studio.can_access(d.id,${actorId}::uuid,false)
        AND (${shared}='all' OR (${shared}='mine' AND d.owner_id=${actorId}::uuid) OR (${shared}='shared' AND d.owner_id<>${actorId}::uuid))
        AND d.name ILIKE ${search}
      ORDER BY d.updated_at DESC,d.id LIMIT 24 OFFSET ${offset}`
  }
  async function get(companyId, actorId, id, db = prisma) {
    const row = await access.get(companyId, actorId, id, db)
    return { ...row, document: validateDocument(row.document) }
  }
  function title(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new StudioError('Escribe un nombre de hasta 160 caracteres.')
    return value.trim()
  }
  async function create(companyId, actorId, input, fileContext) {
    access.identity(companyId, actorId)
    const name = title(input?.name), document = validateDocument(input?.document)
    const row = await prisma.$transaction(async db => {
      await access.lock(db); await access.member(companyId, actorId, 'studio.create', db); await access.member(companyId, actorId, 'studio.view', db)
      if (input?.sourceDesignId) await access.get(companyId, actorId, input.sourceDesignId, db)
      const ids = await access.assets(db, companyId, actorId, document, input?.sourceDesignId ?? null, fileContext, Boolean(input?.sourceDesignId))
      const [row] = await db.$queryRaw`INSERT INTO studio_design(company_id,owner_id,name,document)
        VALUES(${companyId}::uuid,${actorId}::uuid,${name},${JSON.stringify(document)}::jsonb)
        RETURNING id,name,revision,document,updated_at AS "updatedAt"`
      await access.bindAssets(db, row.id, actorId, ids)
      await access.audit(db, companyId, actorId, 'studio.design.create', row)
      return row
    })
    return { ...row, ownerId: actorId, role: 'OWNER', canEdit: true }
  }
  async function update(companyId, actorId, id, input, fileContext) {
    access.identity(companyId, actorId)
    const name = title(input?.name), document = validateDocument(input?.document)
    if (!Number.isSafeInteger(input?.revision) || input.revision < 1) throw new StudioError('Falta la revisión del diseño.')
    const row = await prisma.$transaction(async db => {
      await access.lock(db, id); await access.get(companyId, actorId, id, db, true)
      const ids = await access.assets(db, companyId, actorId, document, id, fileContext)
      const [row] = await db.$queryRaw`UPDATE studio_design SET name=${name},document=${JSON.stringify(document)}::jsonb,
        revision=revision+1,updated_at=now() WHERE id=${id}::uuid AND company_id=${companyId}::uuid AND revision=${input.revision}
        RETURNING id,name,revision,document,updated_at AS "updatedAt"`
      if (!row) throw new StudioError('Hay una versión más reciente. Conserva tus cambios y revisa el servidor.', 409, 'STUDIO_REVISION_CONFLICT')
      await access.bindAssets(db, id, actorId, ids)
      await access.audit(db, companyId, actorId, 'studio.design.update', row)
      return row
    })
    await broadcaster?.broadcastToChannel(`studio:design:${id}`, 'changed', { designId: id, revision: row.revision },
      { authorize: async () => { try { await access.get(companyId, actorId, id); return true } catch { return false } } })
    return row
  }
  // Real-time collaboration: one batch of object operations from an editor
  // session, sequenced by the row lock (no revision check, no conflicts). The
  // result is validated and authorized exactly like a whole-document update,
  // then broadcast so every open editor replays the same operations.
  async function applyChanges(companyId, actorId, id, input, fileContext) {
    access.identity(companyId, actorId)
    if (typeof input?.clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(input.clientId) || !Number.isSafeInteger(input?.batchId)||input.batchId<1) throw new StudioError('Sesión de edición inválida.')
    if(JSON.stringify(input).length>1_100_000)throw new StudioError('Lote demasiado grande.',413)
    let ops
    try { ops = checkOps(input.ops) } catch (error) { throw new StudioError(error.message) }
    const name = input.name === undefined ? null : title(input.name)
    const digest=createHash('sha256').update(JSON.stringify({ops,name})).digest('hex')
    const row = await prisma.$transaction(async db => {
      await access.lock(db, id)
      const current = await access.get(companyId, actorId, id, db, true)
      // The design lock serializes identical concurrent requests. Receipts are
      // durable audit records, scoped to the authenticated actor, never clientId alone.
      const [receipt]=await db.$queryRaw`SELECT metadata FROM audit_log WHERE company_id=${companyId}::uuid AND actor_id=${actorId}::uuid
        AND entity_id=${id}::uuid AND entity_type='StudioDesign' AND module_key='runly.studio' AND action='studio.design.update'
        AND metadata ? 'digest' AND metadata ? 'result'
        AND metadata->>'clientId'=${input.clientId} AND metadata->>'batchId'=${String(input.batchId)} LIMIT 1`
      if(receipt){
        if(receipt.metadata.digest!==digest)throw new StudioError('El identificador del lote ya corresponde a otros cambios.',409,'STUDIO_BATCH_REUSED')
        return {...receipt.metadata.result,id}
      }
      let document
      try { document = validateDocument(applyOps(validateDocument(current.document), ops)) } catch (error) { throw error instanceof StudioError ? error : new StudioError(error.message) }
      const ids = await access.assets(db, companyId, actorId, document, id, fileContext)
      const effective=diffOps(validateDocument(current.document),document)
      const [row] = await db.$queryRaw`UPDATE studio_design SET name=COALESCE(${name},name),document=${JSON.stringify(document)}::jsonb,
        revision=revision+1,updated_at=now() WHERE id=${id}::uuid AND company_id=${companyId}::uuid RETURNING id,name,revision,updated_at AS "updatedAt"`
      await access.bindAssets(db, id, actorId, ids)
      const result={revision:row.revision,name:row.name,ops:effective}
      await access.audit(db, companyId, actorId, 'studio.design.update', row, {live:true,clientId:input.clientId,batchId:input.batchId,digest,result})
      return {...row,...result}
    })
    const message = { designId: id, revision: row.revision, clientId: input.clientId, batchId: input.batchId, ops:row.ops, ...(name !== null ? { name: row.name } : {}) }
    const payload = JSON.stringify(message).length > 200_000 ? { designId: id, revision: row.revision, clientId: input.clientId, batchId: input.batchId, refetch: true } : message
    await broadcaster?.broadcastToChannel(`studio:design:${id}`, 'change', payload,
      { authorize: async () => { try { await access.get(companyId, actorId, id); return true } catch { return false } } })
    return { revision: row.revision, name: row.name, ops:row.ops }
  }
  return { list, get, create, update, applyChanges, access }
}
