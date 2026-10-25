import { FILE_ID, StudioError } from '../../../../shared/studio/document.js'
import { signedUrlWithVariant } from '../../lib/image-variants.js'
import { attachUserAvatarUrls } from '../../lib/attach-user-avatars.js'

export function createStudioCollaboration({ prisma, access, broadcaster, supabaseAdmin }) {
  async function collaborators(companyId, actorId, id) {
    await access.get(companyId, actorId, id)
    return prisma.$queryRaw`SELECT c.user_id AS id,u.display_name AS name,c.role FROM studio_collaborator c
      JOIN user_profile u ON u.id=c.user_id AND u.enabled WHERE c.design_id=${id}::uuid
      AND runly_studio.can_access(c.design_id,c.user_id,false) ORDER BY u.display_name LIMIT 100`
  }
  async function candidates(companyId, actorId, id, q = '') {
    await access.owner(companyId, actorId, id)
    const search = `%${String(q).slice(0,80)}%`
    return prisma.$queryRaw`SELECT u.id,u.display_name AS name FROM user_profile u WHERE u.id<>${actorId}::uuid
      AND u.display_name ILIKE ${search} AND runly_studio.member_active(${companyId}::uuid,u.id,'studio.view')
      ORDER BY u.display_name,u.id LIMIT 20`
  }
  async function share(companyId, actorId, id, input) {
    if (!FILE_ID.test(input?.userId) || !['VIEWER','EDITOR',null].includes(input?.role)) throw new StudioError('Colaborador o permiso inválido.')
    return prisma.$transaction(async db => {
      await access.lock(db, id)
      const record = await access.owner(companyId, actorId, id, db)
      if (input.userId === actorId) throw new StudioError('El propietario conserva la administración.')
      if (input.role !== null) await access.member(companyId, input.userId, 'studio.view', db)
      if (input.role === 'EDITOR') await access.member(companyId, input.userId, 'studio.edit', db)
      if (input.role === null) {
        await db.$queryRaw`DELETE FROM studio_collaborator WHERE design_id=${id}::uuid AND user_id=${input.userId}::uuid RETURNING user_id`
        await db.$queryRaw`DELETE FROM studio_presence WHERE design_id=${id}::uuid AND user_id=${input.userId}::uuid RETURNING user_id`
      } else {
        await db.$queryRaw`INSERT INTO studio_collaborator(design_id,user_id,role,granted_by)
          VALUES(${id}::uuid,${input.userId}::uuid,${input.role},${actorId}::uuid)
          ON CONFLICT(design_id,user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by RETURNING user_id`
      }
      await access.audit(db, companyId, actorId, input.role ? 'studio.collaborator.grant' : 'studio.collaborator.revoke', record, { userId: input.userId, role: input.role })
      return { ok: true }
    })
  }
  async function signedAsset(companyId, actorId, id, fileId) {
    const record = await access.get(companyId, actorId, id)
    if (!record.document.objects.some(object => object.type === 'image' && object.fileAssetId === fileId)) throw new StudioError('Imagen no encontrada.', 404)
    const file = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: companyId, enabled: true } })
    if (!file) throw new StudioError('Imagen no encontrada.', 404)
    const signedUrl = await signedUrlWithVariant(supabaseAdmin, file.bucket, file.objectKey, 'full', 60)
    // Recheck after I/O; never return a newly minted capability after a revocation.
    await access.get(companyId, actorId, id)
    if (!signedUrl) throw new StudioError('No se pudo abrir la imagen original.', 503)
    return { signedUrl, expiresIn: 60 }
  }
  async function live(companyId, actorId, id, input) {
    await access.get(companyId, actorId, id)
    if (typeof input?.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(input.sessionId)) throw new StudioError('Sesión de editor inválida.')
    const { sessionId } = input
    if (input.leave === true) await prisma.$queryRaw`DELETE FROM studio_presence WHERE design_id=${id}::uuid AND user_id=${actorId}::uuid AND session_id=${sessionId} RETURNING session_id`
    else if (input.peek !== true) {
      const record = await access.get(companyId, actorId, id)
      const point = input.cursor
      const x = point?.x ?? null, y = point?.y ?? null
      if ((x !== null && (!Number.isFinite(x) || x < 0 || x > record.document.page.width)) ||
          (y !== null && (!Number.isFinite(y) || y < 0 || y > record.document.page.height))) throw new StudioError('Coordenadas inválidas.')
      const selected = record.document.objects.some(object => object.id === input.selectedId) ? input.selectedId : null
      const rows = await prisma.$transaction(async db => {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${id}:${actorId}`},0))::text`
        await db.$queryRaw`DELETE FROM studio_presence WHERE design_id=${id}::uuid AND seen_at<now()-interval '40 seconds' RETURNING session_id`
        const [capacity] = await db.$queryRaw`SELECT count(*)::int AS count FROM studio_presence WHERE design_id=${id}::uuid AND user_id=${actorId}::uuid AND session_id<>${sessionId}`
        if (capacity.count >= 8) throw new StudioError('Demasiadas sesiones abiertas.', 429)
        return db.$queryRaw`INSERT INTO studio_presence(design_id,user_id,session_id,cursor_x,cursor_y,selected_id)
        VALUES(${id}::uuid,${actorId}::uuid,${sessionId},${x},${y},${selected}) ON CONFLICT(design_id,user_id,session_id)
        DO UPDATE SET cursor_x=excluded.cursor_x,cursor_y=excluded.cursor_y,selected_id=excluded.selected_id,seen_at=now()
        WHERE studio_presence.seen_at < now()-interval '180 milliseconds' RETURNING session_id`
      })
      if (rows.length) await broadcaster?.broadcastToChannel(`studio:design:${id}`, 'presence', { actorId, sessionId }, {
        authorize: async () => { try { await access.get(companyId, actorId, id); return true } catch { return false } },
      })
    }
    // Short TTLs, bounded active roster; remove stale sessions without workers.
    await prisma.$queryRaw`DELETE FROM studio_presence WHERE design_id=${id}::uuid AND seen_at<now()-interval '40 seconds' RETURNING session_id`
    const participants = await prisma.$queryRaw`SELECT p.user_id AS "userId",p.session_id AS "sessionId",u.display_name AS name,
      u.avatar_file_id AS "avatarFileId",p.cursor_x AS x,p.cursor_y AS y,p.selected_id AS "selectedId",p.seen_at AS "seenAt"
      FROM studio_presence p JOIN user_profile u ON u.id=p.user_id WHERE p.design_id=${id}::uuid
      AND p.seen_at>now()-interval '15 seconds' AND runly_studio.can_access(p.design_id,p.user_id,false)
      ORDER BY p.seen_at DESC LIMIT 100`
    await attachUserAvatarUrls(participants, { prisma, supabaseAdmin })
    for (const user of participants) delete user.avatarFileId
    const record = await access.get(companyId, actorId, id)
    const [scope] = await prisma.$queryRaw`SELECT revision::text FROM realtime_authorization_revision WHERE id`
    return { participants, topic: `studio:design:${id}@${scope.revision}`, revision: record.revision, role: record.role, canEdit: record.canEdit }
  }
  return { collaborators, candidates, share, signedAsset, live }
}
