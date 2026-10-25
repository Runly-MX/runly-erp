// Bridge between runly.lms certificates and the Documents hub (kind
// lms.certificate). The hub owns the docx/pptx/pdf template files; each hub
// template has an LmsCertificateTemplate "link" row with the SAME id so courses
// can keep choosing from one list. The link row mirrors name, source, file,
// tags and PDF layout from the hub (sync), and renders go through the engine.
// The built-in 'design' source never touches the hub.
import { DocumentTemplateServiceError } from '../documents/document-errors.js'
import { LMS_CERTIFICATE_KIND } from '../documents/kinds/lms-certificate-kind.js'
import { LmsError } from './lms-error.js'

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const asLmsError = (err) => (err instanceof DocumentTemplateServiceError ? new LmsError(err.message, err.status ?? 400) : err)

// The published version, else the newest one.
const pickVersion = (template, versions) => versions.find((v) => v.id === template.publishedVersionId) ?? versions[0] ?? null

export function createLmsCertHub({ prisma, hub }) {
  async function activeCourses(templateId) {
    return prisma.lmsCourse.count({ where: { certificateTemplateId: templateId, enabled: true, status: { not: 'archived' } } })
  }

  // Link rows for every hub template of the kind; idempotent.
  async function syncCompany(companyId) {
    const templates = await prisma.documentTemplate.findMany({ where: { companyId, kind: LMS_CERTIFICATE_KIND, visibility: 'company', format: { not: 'blocks' } } })
    if (!templates.length) return
    const ids = templates.map((t) => t.id)
    const [versions, rows] = await Promise.all([
      prisma.documentTemplateVersion.findMany({ where: { templateId: { in: ids } }, orderBy: { versionNumber: 'desc' } }),
      prisma.lmsCertificateTemplate.findMany({ where: { companyId, OR: [{ documentTemplateId: { in: ids } }, { id: { in: ids } }] } }),
    ])
    for (const template of templates) {
      const version = pickVersion(template, versions.filter((v) => v.templateId === template.id))
      const row = rows.find((r) => r.documentTemplateId === template.id || r.id === template.id)
      const pdf = template.format === 'pdf'
      const mirror = {
        name: template.name,
        source: template.format,
        fileAssetId: version?.fileAssetId ?? null,
        placeholders: pdf ? [] : (Array.isArray(version?.placeholders) ? version.placeholders : []),
        layout: pdf ? (version?.layout ?? {}) : {},
        documentTemplateId: template.id,
      }
      if (!row) {
        if (template.enabled) await prisma.lmsCertificateTemplate.create({ data: { id: template.id, companyId, ...mirror } })
        continue
      }
      const data = {}
      for (const key of Object.keys(mirror)) if (!same(row[key], mirror[key])) data[key] = mirror[key]
      if (!template.enabled && row.enabled && !(await activeCourses(row.id))) data.enabled = false
      if (Object.keys(data).length) await prisma.lmsCertificateTemplate.update({ where: { id: row.id }, data })
    }
  }

  // Filled certificate as a PDF buffer, or null when the engine could only
  // return a Word/PowerPoint file (Office not configured).
  async function renderPdf({ companyId, template, certificate, data, images }) {
    const present = Object.fromEntries(Object.entries(images).filter(([, value]) => Buffer.isBuffer(value) && value.length))
    const result = await hub.engine.preview({
      companyId, trusted: true, kind: LMS_CERTIFICATE_KIND, templateId: template.documentTemplateId,
      data, images: present, output: 'pdf', title: `Certificado ${certificate.folio}`,
    })
    return result.format === 'pdf' ? result.buffer : null
  }

  // Deprecated LMS upload route: stores the file in the hub (published) and links it.
  async function upload({ companyId, actorId, file, name }) {
    try {
      const { template, warnings } = await hub.fileTemplates.upload({ companyId, profileId: actorId, kind: LMS_CERTIFICATE_KIND, file, name, publish: true })
      await syncCompany(companyId)
      return { id: template.id, warnings: warnings ?? [] }
    } catch (err) { throw asLmsError(err) }
  }

  // Deprecated LMS replace route: new file as a new published version.
  async function replaceFile({ companyId, actorId, row, file }) {
    try {
      const template = await prisma.documentTemplate.findFirst({ where: { id: row.documentTemplateId, companyId } })
      if (!template) throw new LmsError('La plantilla ya no existe en Documentos.', 404)
      const replaced = await hub.fileTemplates.replaceVersionFile({ companyId, profileId: actorId, templateId: template.id, versionId: template.publishedVersionId, file })
      await hub.fileTemplates.publishVersion({ companyId, templateId: template.id, versionId: replaced.template.version.id })
      await syncCompany(companyId)
      return { warnings: replaced.warnings ?? [] }
    } catch (err) { throw asLmsError(err) }
  }

  // PDF layout edited from the LMS field editor: stored on the live version.
  async function saveLayout({ companyId, row, layout }) {
    const template = await prisma.documentTemplate.findFirst({ where: { id: row.documentTemplateId, companyId } })
    if (!template) return
    const versions = await prisma.documentTemplateVersion.findMany({ where: { templateId: template.id }, orderBy: { versionNumber: 'desc' } })
    const version = pickVersion(template, versions)
    if (version) await prisma.documentTemplateVersion.update({ where: { id: version.id }, data: { layout, placeholders: layout.fields.map((f) => f.key) } })
  }

  return { syncCompany, renderPdf, upload, replaceFile, saveLayout }
}
