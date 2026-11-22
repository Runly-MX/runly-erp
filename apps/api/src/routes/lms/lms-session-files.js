// runly.lms evaluation files (spec 2026-11-21 sections 5 and 7, phase 3):
// downloadable material behind the session, and deliveries uploaded straight to
// private storage, verified by the server (real type, size, SHA-256) and kept as
// versions per slot. lms_submission.file_ids always lists the current versions.
import { LmsError } from './lms-core.js'
import { normalizeAssignmentSettings } from './lms-eval-core.js'
import { isUuid } from './lms-eval-shared.js'
import { DELIVERY_UPLOAD } from './lms-media.js'
import { canConfirmUpload, canPresignUpload } from './lms-session-core.js'
import { FILE_TYPES, FILE_TYPE_KEYS, SHA256_RE, typeForName, verifyFileContent } from '../../lib/file-integrity.js'
import { TX_OPTS } from './lms-progress.js'

export const DOWNLOAD_TTL_SECONDS = 120
const MB = 1024 * 1024
const iso = (value) => (value ? new Date(value).toISOString() : null)
const fileGone = () => new LmsError('El archivo no existe.', 404)

export const acceptedTypesOf = (settings) => settings.acceptedTypes ?? FILE_TYPE_KEYS

// Public shape of one delivered version (no file ids of storage, no paths).
export const versionShape = (row) => ({
  id: row.id, fileId: row.fileId, slot: row.slot, version: row.version, status: row.status, fileName: row.fileName, fileType: row.fileType,
  mimeType: row.mimeType, sizeBytes: Number(row.sizeBytes), sha256: row.sha256, presignedAt: iso(row.presignedAt), confirmedAt: iso(row.confirmedAt),
  replacedAt: iso(row.replacedAt), afterClose: row.afterClose,
})

// owner: PROFILE_OWNER or GUEST_OWNER (who uploads). clock: shared with the session service.
export function createLmsSessionFiles({ prisma, media, owner, clock }) {
  const needMedia = () => { if (!media) throw new LmsError('La subida de archivos no está disponible.', 503) }

  async function deliveryFor(session, activityId) {
    const sub = isUuid(activityId) ? await prisma.lmsSubmission.findFirst({ where: { sessionId: session.id, lessonId: activityId } }) : null
    if (!sub) throw new LmsError('La actividad no existe.', 404)
    const lesson = await prisma.lmsLesson.findUnique({ where: { id: sub.lessonId } })
    return { sub, settings: normalizeAssignmentSettings(lesson?.settings) }
  }

  const activeRows = (submissionId, db = prisma) => db.lmsSubmissionFile.findMany({ where: { submissionId, status: 'active' }, orderBy: { slot: 'asc' } })

  // ---- uploads ----------------------------------------------------------------
  // The authorization is bound to one object (signed upload URL), one declared
  // name/size/hash and one slot; confirm checks the stored bytes against it.
  async function presign({ session, p, companyId }, body = {}) {
    needMedia()
    if (!canPresignUpload(session, clock())) throw new LmsError('Se terminó el tiempo para subir archivos.', 409, 'EXPIRED')
    const { sub, settings } = await deliveryFor(session, body.activityId)
    if (sub.status !== 'draft') throw new LmsError('La evaluación ya fue entregada.', 409, 'SESSION_CLOSED')
    if (!settings.allowFiles) throw new LmsError('Esta actividad no admite archivos.', 400)
    const fileName = String(body.fileName ?? '').trim()
    const type = typeForName(fileName)
    if (!type || !acceptedTypesOf(settings).includes(type)) {
      throw new LmsError(`Ese tipo de archivo no se admite. Usa: ${acceptedTypesOf(settings).map((key) => FILE_TYPES[key].ext[0]).join(', ')}.`, 400, 'TYPE_NOT_ALLOWED')
    }
    const size = Number(body.sizeBytes)
    if (!Number.isInteger(size) || size <= 0) throw new LmsError('El tamaño del archivo es inválido.', 400)
    if (size > settings.maxFileMb * MB) throw new LmsError(`El archivo supera ${settings.maxFileMb} MB.`, 413, 'TOO_LARGE')
    const sha256 = body.sha256 ? String(body.sha256).toLowerCase() : null
    if (sha256 && !SHA256_RE.test(sha256)) throw new LmsError('Huella SHA-256 inválida.', 400)
    const active = await activeRows(sub.id)
    // A replacement targets the slot of the file it replaces; a new file gets its
    // slot when confirmed (inside the transaction), so parallel uploads never collide.
    let slot = null
    if (body.replaceFileId) {
      const target = active.find((row) => row.fileId === body.replaceFileId)
      if (!target) throw new LmsError('El archivo que quieres reemplazar ya no está en tu entrega.', 409, 'REPLACE_TARGET_GONE')
      slot = target.slot
    } else if (active.length >= settings.maxFiles) {
      throw new LmsError(`Ya tienes ${settings.maxFiles} ${settings.maxFiles === 1 ? 'archivo' : 'archivos'}. Reemplaza o quita uno.`, 409, 'MAX_FILES')
    }
    const { fileId, uploadUrl } = await media.presign(companyId, owner.uploadedById(p.actor), { fileName, mimeType: FILE_TYPES[type].mime, sizeBytes: size }, DELIVERY_UPLOAD, {
      ...(owner.metadata(p.actor) ?? {}), sessionId: session.id, submissionId: sub.id, activityId: sub.lessonId, slot,
      declared: { name: fileName, sizeBytes: size, sha256 },
    })
    return { fileId, uploadUrl, slot, expiresInSeconds: 600 }
  }

  async function ownAsset(session, p, fileId) {
    const asset = isUuid(fileId) ? await prisma.fileAsset.findFirst({ where: { id: fileId, moduleKey: 'runly.lms', entityType: DELIVERY_UPLOAD.entityType } }) : null
    if (!asset || asset.metadata?.sessionId !== session.id) throw fileGone()
    if (asset.uploadedById !== owner.uploadedById(p.actor) || !owner.ownsFile(asset, p.actor)) throw fileGone()
    return asset
  }

  // Idempotent: a repeated confirm returns the recorded version; a rejected file
  // answers its rejection again. A missing object (transfer not finished) leaves
  // the authorization open for a retry inside the window.
  async function confirm({ session, p }, fileId) {
    needMedia()
    const asset = await ownAsset(session, p, fileId)
    const recorded = await prisma.lmsSubmissionFile.findUnique({ where: { fileId: asset.id } })
    if (recorded) return { ...versionShape(recorded), repeated: true }
    if (asset.metadata?.rejected) throw new LmsError(asset.metadata.rejected.message, 400, asset.metadata.rejected.code)
    if (!asset.enabled) throw fileGone()
    if (!canConfirmUpload(session, asset, clock())) throw new LmsError('Se terminó el tiempo para subir archivos.', 409, 'EXPIRED')
    const { sub, settings } = await deliveryFor(session, asset.metadata.activityId)
    const buf = await media.readObject(asset)
    if (!buf) throw new LmsError('El archivo no terminó de subirse. Inténtalo de nuevo.', 409, 'NOT_UPLOADED')
    const declared = asset.metadata.declared ?? {}
    const check = verifyFileContent(buf, { fileName: declared.name, sizeBytes: declared.sizeBytes, sha256: declared.sha256 }, acceptedTypesOf(settings))
    if (!check.ok) {
      const { pending: _p, ...metadata } = asset.metadata
      await prisma.fileAsset.update({ where: { id: asset.id }, data: { enabled: false, metadata: { ...metadata, rejected: { code: check.code, message: check.message, at: clock().toISOString() } } } })
      await media.removeObject(asset)
      throw new LmsError(check.message, 400, check.code)
    }
    const afterClose = session.status !== 'in_progress'
    const row = await attach({ sub, settings, asset, check, afterClose })
    const { pending: _pending, ...metadata } = asset.metadata
    await prisma.fileAsset.update({ where: { id: asset.id }, data: { mimeType: check.mime, metadata: { ...metadata, verified: { type: check.type, sha256: check.sha256, at: clock().toISOString() } } } })
    return versionShape(row)
  }

  // One transaction per try. Two confirms racing for the same slot: the second
  // hits the "one active per slot" index, retries, and replaces the first (the
  // later confirmation wins, nothing is lost: the first stays as a version).
  async function attach({ sub, settings, asset, check, afterClose }, tries = 3) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.lmsSubmission.findUnique({ where: { id: sub.id } })
        const open = current.status === 'draft'
        if (!open && !(afterClose && ['submitted', 'missing'].includes(current.status) && !current.gradedAt)) {
          throw new LmsError('La evaluación ya fue entregada.', 409, 'SESSION_CLOSED')
        }
        const active = await activeRows(sub.id, tx)
        const slot = asset.metadata.slot ?? ((await tx.lmsSubmissionFile.aggregate({ where: { submissionId: sub.id }, _max: { slot: true } }))._max.slot ?? 0) + 1
        const sameSlot = active.find((row) => row.slot === slot)
        if (!sameSlot && active.length >= settings.maxFiles) throw new LmsError('Ya no caben más archivos en esta entrega.', 409, 'MAX_FILES')
        if (sameSlot) await tx.lmsSubmissionFile.update({ where: { id: sameSlot.id }, data: { status: 'replaced', replacedAt: clock() } })
        const top = await tx.lmsSubmissionFile.aggregate({ where: { submissionId: sub.id, slot }, _max: { version: true } })
        const row = await tx.lmsSubmissionFile.create({
          data: {
            companyId: sub.companyId, submissionId: sub.id, fileId: asset.id, slot, version: (top._max.version ?? 0) + 1, status: 'active',
            fileName: asset.metadata.declared?.name ?? asset.originalName, fileType: check.type, mimeType: check.mime, sizeBytes: BigInt(check.size),
            sha256: check.sha256, presignedAt: asset.createdAt, confirmedAt: clock(), afterClose,
          },
        })
        const fileIds = (await activeRows(sub.id, tx)).map((item) => item.fileId)
        await tx.lmsSubmission.update({ where: { id: sub.id }, data: { fileIds, ...(current.status === 'missing' ? { status: 'submitted' } : {}) } })
        return row
      }, TX_OPTS)
    } catch (error) {
      if (error?.code !== 'P2002') throw error
      const done = await prisma.lmsSubmissionFile.findUnique({ where: { fileId: asset.id } })
      if (done) return done
      if (tries <= 1) throw new LmsError('Otro archivo se confirmó al mismo tiempo. Intenta de nuevo.', 409, 'CONFLICT')
      return attach({ sub, settings, asset, check, afterClose }, tries - 1)
    }
  }

  // Quitting a file keeps it as a removed version (audit); only while open.
  async function remove({ session, p }, fileId) {
    const row = isUuid(fileId) ? await prisma.lmsSubmissionFile.findUnique({ where: { fileId } }) : null
    if (!row || row.status !== 'active') throw fileGone()
    await ownAsset(session, p, row.fileId)
    return prisma.$transaction(async (tx) => {
      const sub = await tx.lmsSubmission.findUnique({ where: { id: row.submissionId } })
      if (sub.status !== 'draft') throw new LmsError('La evaluación ya fue entregada.', 409, 'SESSION_CLOSED')
      const { count } = await tx.lmsSubmissionFile.updateMany({ where: { id: row.id, status: 'active' }, data: { status: 'removed', replacedAt: clock() } })
      if (!count) throw fileGone()
      const fileIds = (await activeRows(sub.id, tx)).map((item) => item.fileId)
      await tx.lmsSubmission.update({ where: { id: sub.id }, data: { fileIds } })
      return { fileId, removed: true }
    }, TX_OPTS)
  }

  // ---- material -------------------------------------------------------------------
  async function resourcesFor(lessonIds) {
    if (!lessonIds.length) return new Map()
    const rows = await prisma.lmsLessonResource.findMany({ where: { lessonId: { in: lessonIds } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
    const files = rows.length ? await prisma.fileAsset.findMany({ where: { id: { in: rows.map((row) => row.fileId) } }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, enabled: true } }) : []
    const byId = new Map(files.map((file) => [file.id, file]))
    const out = new Map()
    for (const row of rows) {
      const file = byId.get(row.fileId)
      if (!file?.enabled) continue
      const list = out.get(row.lessonId) ?? []
      list.push({ id: row.id, title: row.title ?? null, fileName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes === null ? null : Number(file.sizeBytes) })
      out.set(row.lessonId, list)
    }
    return out
  }

  // While the session runs (before the deadline), or after it when the
  // evaluation allows it. An URL issued earlier stays valid its 120 s.
  async function downloadResource({ session, assessment }, resourceId) {
    needMedia()
    const resource = isUuid(resourceId) ? await prisma.lmsLessonResource.findUnique({ where: { id: resourceId } }) : null
    const inSession = (session.snapshot?.activities ?? []).some((item) => item.lessonId === resource?.lessonId)
    if (!resource || !inSession) throw fileGone()
    const now = clock()
    const running = session.status === 'in_progress' && (!session.expiresAt || now <= new Date(session.expiresAt))
    const afterwards = session.status !== 'in_progress' && session.status !== 'voided' && assessment.settings.materialAfterSubmit
    if (!running && !afterwards) throw new LmsError('El material ya no está disponible: la evaluación terminó.', 409, 'MATERIAL_CLOSED')
    const asset = await prisma.fileAsset.findFirst({ where: { id: resource.fileId, enabled: true } })
    if (!asset) throw fileGone()
    return { url: await media.signDownload(asset, DOWNLOAD_TTL_SECONDS, asset.originalName), fileName: asset.originalName, expiresInSeconds: DOWNLOAD_TTL_SECONDS }
  }

  // ---- graders -------------------------------------------------------------------
  async function reviewFiles(companyId, sessionId) {
    const session = isUuid(sessionId) ? await prisma.lmsAssessmentSession.findFirst({ where: { id: sessionId, companyId } }) : null
    if (!session) throw new LmsError('La sesión no existe.', 404)
    const subs = await prisma.lmsSubmission.findMany({ where: { sessionId: session.id }, include: { versions: { orderBy: [{ slot: 'asc' }, { version: 'desc' }] } } })
    const titles = new Map((session.snapshot?.activities ?? []).map((item) => [item.lessonId, item.title]))
    return {
      session: { id: session.id, status: session.status, startedAt: iso(session.startedAt), expiresAt: iso(session.expiresAt), submittedAt: iso(session.submittedAt), closedReason: session.closedReason },
      deliveries: subs.map((sub) => ({ activityId: sub.lessonId, title: titles.get(sub.lessonId) ?? null, status: sub.status, text: sub.text, versions: sub.versions.map(versionShape) })),
    }
  }

  // Graders download any version (current or earlier) of their company.
  async function reviewDownload(companyId, versionId) {
    needMedia()
    const row = isUuid(versionId) ? await prisma.lmsSubmissionFile.findFirst({ where: { id: versionId, companyId } }) : null
    const asset = row ? await prisma.fileAsset.findFirst({ where: { id: row.fileId } }) : null
    if (!row || !asset) throw fileGone()
    return { url: await media.signDownload(asset, DOWNLOAD_TTL_SECONDS, row.fileName), fileName: row.fileName, expiresInSeconds: DOWNLOAD_TTL_SECONDS, sha256: row.sha256 }
  }

  return { presign, confirm, remove, resourcesFor, downloadResource, reviewFiles, reviewDownload, activeRows }
}
