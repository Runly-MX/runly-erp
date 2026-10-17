// runly.lms certificates: templates, manual issue/revoke, lists, PDFs (manager,
// learner and public). Automatic issue lives in lms-cert-issue.js.
import { resolveAppBaseUrl } from '../../services/email-templates.js'
import { LmsError } from './lms-error.js'
import { normalizeTemplateInput } from './lms-cert-core.js'
import { issueCertificate } from './lms-cert-issue.js'
import { renderCertificatePdf } from './lms-cert-pdf.js'

const iso = (value) => (value ? new Date(value).toISOString() : null)
const TX = { maxWait: 10_000, timeout: 30_000 }
const TOKEN = /^[A-Za-z0-9_-]{24}$/
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg'])

export const certVerifyPath = (token) => `/app/p/lms/cert/${token}`

// Best effort: a missing or slow image never blocks the PDF.
async function fetchImage(fetchImpl, url) {
  if (!url) return null
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.length <= IMAGE_MAX_BYTES ? buffer : null
  } catch {
    return null
  }
}

export function createLmsCertService({ prisma, signFile = null, appBaseUrl = () => resolveAppBaseUrl(process.env), fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const sign = async (fileId, variant) => (signFile && fileId ? signFile(fileId, variant).catch(() => null) : null)

  // Absolute when the app URL is known; otherwise relative (and the PDF skips the QR).
  function verifyUrlFor(token) {
    const base = appBaseUrl()
    return base ? `${base}${certVerifyPath(token)}` : certVerifyPath(token)
  }
  const qrUrlFor = (token) => (appBaseUrl() ? verifyUrlFor(token) : null)

  // ---- templates ----------------------------------------------------------
  async function findTemplate(companyId, id) {
    const row = await prisma.lmsCertificateTemplate.findFirst({ where: { id, companyId } })
    if (!row) throw new LmsError('La plantilla de certificado no existe.', 404)
    return row
  }

  const activeCourses = (templateId) => prisma.lmsCourse.count({ where: { certificateTemplateId: templateId, enabled: true, status: { not: 'archived' } } })

  async function serializeTemplate(row, courseCount = null) {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      body: row.body,
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      signatureFileId: row.signatureFileId,
      signatureUrl: await sign(row.signatureFileId, 'full'),
      accentColor: row.accentColor,
      showLogo: row.showLogo,
      enabled: row.enabled,
      courseCount: courseCount ?? await activeCourses(row.id),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  async function assertSignature(companyId, fileId) {
    if (!fileId) return
    const file = await prisma.fileAsset.findFirst({ where: { id: fileId, enabled: true }, select: { metadata: true, mimeType: true } })
    if (!file || file.metadata?.companyId !== companyId) throw new LmsError('El archivo de la firma no existe.', 404)
    if (!IMAGE_MIME.has(String(file.mimeType).toLowerCase())) throw new LmsError('La firma debe ser una imagen PNG o JPEG.', 400)
  }

  async function assertNotInUse(templateId) {
    const count = await activeCourses(templateId)
    if (count) throw new LmsError(`La plantilla está asignada a ${count} ${count === 1 ? 'curso' : 'cursos'}. Quítala de esos cursos antes de desactivarla.`, 409, 'IN_USE')
  }

  async function listTemplates(companyId) {
    const rows = await prisma.lmsCertificateTemplate.findMany({ where: { companyId }, orderBy: [{ enabled: 'desc' }, { name: 'asc' }] })
    const counts = rows.length
      ? await prisma.lmsCourse.groupBy({ by: ['certificateTemplateId'], where: { certificateTemplateId: { in: rows.map((r) => r.id) }, enabled: true, status: { not: 'archived' } }, _count: { _all: true } })
      : []
    const byId = new Map(counts.map((row) => [row.certificateTemplateId, row._count._all]))
    return Promise.all(rows.map((row) => serializeTemplate(row, byId.get(row.id) ?? 0)))
  }

  async function createTemplate(companyId, actorId, body) {
    const data = normalizeTemplateInput(body, { partial: false })
    await assertSignature(companyId, data.signatureFileId)
    const row = await prisma.lmsCertificateTemplate.create({ data: { ...data, companyId, createdById: actorId } })
    return serializeTemplate(row, 0)
  }

  async function updateTemplate(companyId, id, body) {
    const current = await findTemplate(companyId, id)
    const data = normalizeTemplateInput(body, { partial: true })
    if (data.signatureFileId) await assertSignature(companyId, data.signatureFileId)
    if (data.enabled === false && current.enabled) await assertNotInUse(current.id)
    const row = await prisma.lmsCertificateTemplate.update({ where: { id: current.id }, data })
    return serializeTemplate(row)
  }

  async function disableTemplate(companyId, id) {
    const current = await findTemplate(companyId, id)
    await assertNotInUse(current.id)
    const row = current.enabled ? await prisma.lmsCertificateTemplate.update({ where: { id: current.id }, data: { enabled: false } }) : current
    return serializeTemplate(row, 0)
  }

  // ---- PDF ----------------------------------------------------------------
  async function companyBrand(companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, brandingConfig: { select: { logoFileId: true, primaryColor: true } } } })
    return { name: company?.name ?? null, logoFileId: company?.brandingConfig?.logoFileId ?? null, primaryColor: company?.brandingConfig?.primaryColor ?? null }
  }

  async function renderPdf(companyId, certificate, template, verifyUrl) {
    const brand = await companyBrand(companyId)
    const [logoBuffer, signatureBuffer] = await Promise.all([
      template?.showLogo !== false && brand.logoFileId ? sign(brand.logoFileId, 'full').then((url) => fetchImage(fetchImpl, url)) : null,
      template?.signatureFileId ? sign(template.signatureFileId, 'full').then((url) => fetchImage(fetchImpl, url)) : null,
    ])
    return renderCertificatePdf({ certificate, template, brand, companyName: brand.name, verifyUrl, logoBuffer, signatureBuffer })
  }

  async function certificatePdf(row) {
    const template = row.templateId ? await prisma.lmsCertificateTemplate.findUnique({ where: { id: row.templateId } }) : null
    const buffer = await renderPdf(row.companyId, row, template, qrUrlFor(row.token))
    return { buffer, filename: `certificado-${row.folio}.pdf` }
  }

  async function previewPdf(companyId, id) {
    const template = await findTemplate(companyId, id)
    const sample = { folio: `${new Date().getFullYear()}-000000`, learnerName: 'Nombre del alumno', courseTitle: 'Nombre del curso', hours: 2, issuedAt: new Date(), revokedAt: null }
    const buffer = await renderPdf(companyId, sample, template, qrUrlFor('ejemplo-ejemplo-ejemplo-0'))
    return { buffer, filename: 'vista-previa-certificado.pdf' }
  }

  // ---- certificates -------------------------------------------------------
  async function serializeCertificates(rows) {
    const issuerIds = [...new Set(rows.map((row) => row.issuedById).filter(Boolean))]
    const issuers = issuerIds.length ? await prisma.userProfile.findMany({ where: { id: { in: issuerIds } }, select: { id: true, displayName: true, email: true } }) : []
    const issuerById = new Map(issuers.map((p) => [p.id, { id: p.id, displayName: p.displayName || p.email }]))
    return rows.map((row) => ({
      id: row.id,
      folio: row.folio,
      token: row.token,
      verifyUrl: verifyUrlFor(row.token),
      learner: { id: row.learnerId, displayName: row.learnerName },
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      learnerName: row.learnerName,
      hours: row.hours,
      issuedAt: iso(row.issuedAt),
      // null = issued automatically on completion.
      issuedBy: row.issuedById ? issuerById.get(row.issuedById) ?? { id: row.issuedById, displayName: null } : null,
      revokedAt: iso(row.revokedAt),
      revokeReason: row.revokeReason,
    }))
  }
  const serializeCertificate = async (row) => (await serializeCertificates([row]))[0]

  async function findCertificate(companyId, id) {
    const row = await prisma.lmsCertificate.findFirst({ where: { id, companyId } })
    if (!row) throw new LmsError('El certificado no existe.', 404)
    return row
  }

  async function issueManual(companyId, actorId, enrollmentId) {
    const enrollment = await prisma.lmsEnrollment.findFirst({ where: { id: enrollmentId, companyId } })
    if (!enrollment) throw new LmsError('La inscripción no existe.', 404)
    if (enrollment.status !== 'completed') throw new LmsError('La persona aún no completa el curso.', 409, 'NOT_COMPLETED')
    const course = await prisma.lmsCourse.findUnique({ where: { id: enrollment.courseId }, select: { certificateTemplate: { select: { enabled: true } } } })
    if (!course?.certificateTemplate?.enabled) throw new LmsError('El curso no tiene una plantilla de certificado.', 409, 'NO_TEMPLATE')
    const result = await prisma.$transaction((tx) => issueCertificate(tx, { enrollment, issuedById: actorId }), TX)
    if (!result) throw new LmsError('El curso no tiene una plantilla de certificado.', 409, 'NO_TEMPLATE')
    if (!result.created) throw new LmsError('Esta inscripción ya tiene un certificado vigente.', 409, 'ALREADY_ISSUED')
    return serializeCertificate(result.certificate)
  }

  async function revoke(companyId, id, body = {}) {
    const current = await findCertificate(companyId, id)
    const reason = String(body?.reason ?? '').trim()
    if (!reason) throw new LmsError('Escribe el motivo de la revocación.', 400)
    if (reason.length > 500) throw new LmsError('El motivo no puede pasar de 500 caracteres.', 400)
    if (current.revokedAt) throw new LmsError('El certificado ya está revocado.', 409, 'ALREADY_REVOKED')
    const row = await prisma.lmsCertificate.update({ where: { id: current.id }, data: { revokedAt: new Date(), revokeReason: reason } })
    return serializeCertificate(row)
  }

  async function listCourseCertificates(companyId, courseId) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, select: { id: true } })
    if (!course) throw new LmsError('El curso no existe.', 404)
    return serializeCertificates(await prisma.lmsCertificate.findMany({ where: { companyId, courseId: course.id }, orderBy: { issuedAt: 'desc' } }))
  }

  async function managerPdf(companyId, id) {
    return certificatePdf(await findCertificate(companyId, id))
  }

  const findLearner = (companyId, userProfileId) => (userProfileId
    ? prisma.lmsLearner.findUnique({ where: { companyId_userProfileId: { companyId, userProfileId } }, select: { id: true } })
    : null)

  async function myCertificates(companyId, userProfileId) {
    const learner = await findLearner(companyId, userProfileId)
    if (!learner) return []
    return serializeCertificates(await prisma.lmsCertificate.findMany({ where: { companyId, learnerId: learner.id }, orderBy: { issuedAt: 'desc' } }))
  }

  // Own certificates only; someone else's id answers 404, never 403.
  async function myCertificatePdf(companyId, userProfileId, id) {
    const learner = await findLearner(companyId, userProfileId)
    const row = learner ? await prisma.lmsCertificate.findFirst({ where: { id, companyId, learnerId: learner.id } }) : null
    if (!row) throw new LmsError('El certificado no existe.', 404)
    return certificatePdf(row)
  }

  // ---- public -------------------------------------------------------------
  async function byToken(token) {
    const row = TOKEN.test(String(token ?? '')) ? await prisma.lmsCertificate.findUnique({ where: { token } }) : null
    if (!row) throw new LmsError('El certificado no existe.', 404, 'NOT_FOUND')
    return row
  }

  async function publicCertificate(token) {
    const row = await byToken(token)
    const brand = await companyBrand(row.companyId)
    return {
      folio: row.folio,
      learnerName: row.learnerName,
      courseTitle: row.courseTitle,
      hours: row.hours,
      issuedAt: iso(row.issuedAt),
      companyName: brand.name,
      logoUrl: await sign(brand.logoFileId, 'card'),
      revoked: Boolean(row.revokedAt),
      revokedAt: iso(row.revokedAt),
    }
  }

  async function publicCertificatePdf(token) {
    return certificatePdf(await byToken(token))
  }

  return {
    listTemplates, createTemplate, updateTemplate, disableTemplate, previewPdf,
    issueManual, revoke, listCourseCertificates, managerPdf, myCertificates, myCertificatePdf,
    publicCertificate, publicCertificatePdf, verifyUrlFor,
  }
}
