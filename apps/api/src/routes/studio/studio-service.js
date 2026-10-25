import { FILE_ID, StudioError, validateDocument } from '../../../../shared/studio/document.js'

export function createStudioService({ prisma }) {
  function identity(companyId, actorId) {
    if (!FILE_ID.test(companyId) || !FILE_ID.test(actorId)) throw new StudioError('Diseño no encontrado.', 404)
  }
  function title(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new StudioError('Escribe un nombre de hasta 160 caracteres.')
    return value.trim()
  }
  async function assets(db, companyId, actorId, document) {
    const ids = [...new Set(document.objects.filter(o => o.type === 'image').map(o => o.fileAssetId))]
    if (!ids.length) return
    // First vertical: originals owned by this actor in this company, never arbitrary URLs.
    const rows = await db.fileAsset.findMany({ where: { id: { in: ids }, entityId: companyId, uploadedById: actorId, enabled: true,
      mimeType: { in: ['image/png', 'image/jpeg', 'image/webp'] } }, select: { id: true } })
    if (rows.length !== ids.length) throw new StudioError('Una imagen no está disponible o no te pertenece.', 403, 'STUDIO_ASSET_DENIED')
  }
  async function audit(db, companyId, actorId, action, row) {
    await db.auditLog.create({ data: { companyId, actorId, moduleKey: 'runly.studio', entityType: 'StudioDesign', entityId: row.id,
      action, metadata: { revision: row.revision, name: row.name } } })
  }
  async function list(companyId, actorId, { page = 1 } = {}) {
    identity(companyId, actorId)
    const offset = (Math.max(1, Math.min(10000, Number.parseInt(page, 10) || 1)) - 1) * 24
    return prisma.$queryRaw`SELECT id, name, revision, updated_at AS "updatedAt" FROM studio_design
      WHERE company_id = ${companyId}::uuid AND owner_id = ${actorId}::uuid AND enabled = true
      ORDER BY updated_at DESC, id LIMIT 24 OFFSET ${offset}`
  }
  async function get(companyId, actorId, id, db = prisma) {
    identity(companyId, actorId)
    if (!FILE_ID.test(id)) throw new StudioError('Diseño no encontrado.', 404)
    const rows = await db.$queryRaw`SELECT id, name, revision, document, updated_at AS "updatedAt" FROM studio_design
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid AND owner_id = ${actorId}::uuid AND enabled = true`
    if (!rows[0]) throw new StudioError('Diseño no encontrado.', 404)
    return rows[0]
  }
  async function create(companyId, actorId, input) {
    identity(companyId, actorId)
    const name = title(input?.name), document = validateDocument(input?.document)
    return prisma.$transaction(async db => {
      await assets(db, companyId, actorId, document)
      const [row] = await db.$queryRaw`INSERT INTO studio_design (company_id, owner_id, name, document)
        VALUES (${companyId}::uuid, ${actorId}::uuid, ${name}, ${JSON.stringify(document)}::jsonb)
        RETURNING id, name, revision, document, updated_at AS "updatedAt"`
      await audit(db, companyId, actorId, 'studio.design.create', row)
      return row
    })
  }
  async function update(companyId, actorId, id, input) {
    identity(companyId, actorId)
    const name = title(input?.name), document = validateDocument(input?.document)
    if (!Number.isSafeInteger(input?.revision) || input.revision < 1) throw new StudioError('Falta la revisión del diseño.')
    return prisma.$transaction(async db => {
      await get(companyId, actorId, id, db)
      await assets(db, companyId, actorId, document)
      const [row] = await db.$queryRaw`UPDATE studio_design SET name = ${name}, document = ${JSON.stringify(document)}::jsonb,
        revision = revision + 1, updated_at = now()
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid AND owner_id = ${actorId}::uuid AND enabled = true AND revision = ${input.revision}
        RETURNING id, name, revision, document, updated_at AS "updatedAt"`
      if (!row) throw new StudioError('Hay una versión más reciente. Conserva tus cambios y vuelve a abrir el diseño.', 409, 'STUDIO_REVISION_CONFLICT')
      await audit(db, companyId, actorId, 'studio.design.update', row)
      return row
    })
  }
  return { list, get, create, update }
}
