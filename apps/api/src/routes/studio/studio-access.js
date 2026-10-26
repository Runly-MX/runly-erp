import { FILE_ID, StudioError } from '../../../../shared/studio/document.js'
import {createStudioImageLineage} from './studio-image-lineage.js'

export function createStudioAccess({ prisma, filesService }) {
  const {imageAllowed}=createStudioImageLineage({prisma})
  function identity(companyId, actorId) {
    if (!FILE_ID.test(companyId) || !FILE_ID.test(actorId)) throw new StudioError('Diseño no encontrado.', 404)
  }
  async function member(companyId, actorId, permission = 'studio.view', db = prisma) {
    identity(companyId, actorId)
    const [row] = await db.$queryRaw`SELECT runly_studio.member_active(${companyId}::uuid,${actorId}::uuid,${permission}) AS allowed`
    if (!row?.allowed) throw new StudioError('No tienes acceso a Studio en esta empresa.', 403)
  }
  async function lock(db, id) {
    if (id && !FILE_ID.test(id)) throw new StudioError('Diseño no encontrado.', 404)
    await db.$queryRaw`SELECT revision FROM realtime_authorization_revision WHERE id FOR UPDATE`
    if (id) await db.$queryRaw`SELECT id FROM studio_design WHERE id=${id}::uuid FOR UPDATE`
  }
  async function get(companyId, actorId, id, db = prisma, edit = false) {
    identity(companyId, actorId)
    if (!FILE_ID.test(id)) throw new StudioError('Diseño no encontrado.', 404)
    const [row] = await db.$queryRaw`SELECT d.id,d.name,d.revision,d.document,d.owner_id AS "ownerId",u.display_name AS "ownerName",
      d.updated_at AS "updatedAt", CASE WHEN d.owner_id=${actorId}::uuid THEN 'OWNER' ELSE c.role END AS role,
      runly_studio.can_access(d.id,${actorId}::uuid,true) AS "canEdit"
      FROM studio_design d JOIN user_profile u ON u.id=d.owner_id
      LEFT JOIN studio_collaborator c ON c.design_id=d.id AND c.user_id=${actorId}::uuid
      WHERE d.id=${id}::uuid AND d.company_id=${companyId}::uuid AND runly_studio.can_access(d.id,${actorId}::uuid,${edit})`
    if (!row) throw new StudioError('Diseño no encontrado.', 404)
    return row
  }
  async function owner(companyId, actorId, id, db = prisma) {
    const row = await get(companyId, actorId, id, db, true)
    if (row.ownerId !== actorId) throw new StudioError('Solo el propietario administra colaboradores.', 403)
    return row
  }
  async function assets(db, companyId, actorId, document, designId = null, fileContext, copying = false) {
    const ids = [...new Set(document.objects.filter(o => o.type === 'image').map(o => o.fileAssetId))]
    const origins = new Map()
    for (const id of ids) {
      let [file] = await db.$queryRaw`SELECT f.id,f.uploaded_by_id AS "uploadedById",
        (SELECT a.origin_design_id FROM studio_design_asset a WHERE a.design_id=${designId}::uuid AND a.file_id=f.id) AS origin
        FROM file_asset f WHERE f.id=${id}::uuid AND f.entity_id=${companyId}::uuid
        AND f.enabled AND f.mime_type IN ('image/png','image/jpeg','image/webp') AND
        (f.uploaded_by_id=${actorId}::uuid OR EXISTS(SELECT 1 FROM studio_design_asset a WHERE a.design_id=${designId}::uuid AND a.file_id=f.id))`
      if(!file&&designId&&await imageAllowed(companyId,designId,id,db)){
        ;[file]=await db.$queryRaw`SELECT id,uploaded_by_id AS \"uploadedById\",NULL::uuid AS origin FROM file_asset
          WHERE id=${id}::uuid AND entity_id=${companyId}::uuid AND enabled AND mime_type IN ('image/png','image/jpeg','image/webp')`
      }
      if (!file) {
        if (!filesService || !fileContext) throw new StudioError('Una imagen no está disponible o no está autorizada.', 403, 'STUDIO_ASSET_DENIED')
        await member(companyId, actorId, 'files.assets.read', db)
        try {
          const candidate = await filesService.getById({ ...fileContext, id })
          if (!candidate.enabled || !['image/png','image/jpeg','image/webp'].includes(candidate.mimeType)) throw Error('invalid')
        } catch { throw new StudioError('Una imagen no está disponible o no está autorizada.', 403, 'STUDIO_ASSET_DENIED') }
      }
      if (copying && file && file.uploadedById !== actorId) origins.set(id, file.origin ?? designId)
    }
    return { ids, origins }
  }
  async function bindAssets(db, designId, actorId, { ids, origins }) {
    await db.$queryRaw`DELETE FROM studio_design_asset WHERE design_id=${designId}::uuid AND NOT(file_id=ANY(${ids}::uuid[])) RETURNING file_id`
    for (const id of ids) await db.$queryRaw`INSERT INTO studio_design_asset(design_id,file_id,added_by,origin_design_id)
      VALUES(${designId}::uuid,${id}::uuid,${actorId}::uuid,${origins.get(id) ?? null}::uuid) ON CONFLICT DO NOTHING RETURNING file_id`
  }
  async function audit(db, companyId, actorId, action, row, metadata = {}) {
    await db.auditLog.create({ data: { companyId, actorId, moduleKey: 'runly.studio', entityType: 'StudioDesign', entityId: row.id,
      action, metadata: { revision: row.revision, name: row.name, ...metadata } } })
  }
  return { identity, member, lock, get, owner, assets, bindAssets, audit, imageAllowed }
}
