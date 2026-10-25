import { StudioError, validateDocument } from '../../../../shared/studio/document.js'
import { createStudioAccess } from './studio-access.js'

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
  return { list, get, create, update, access }
}
