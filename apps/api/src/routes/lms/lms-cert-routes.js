// runly.lms certificate routes (internal), registered from createLmsRouter.
import { createLmsCertService } from './lms-cert-service.js'
import { CERT_DOCX_PLACEHOLDERS, DOCX_MIME, buildSampleCertificateDocx } from './lms-cert-docx.js'
import { PPTX_MIME, buildSampleCertificatePptx } from './lms-cert-pptx.js'
import { CERT_FIELD_KEYS } from './lms-cert-pdf-layout.js'
import { wantsAutoTag } from './lms-cert-templates.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))

export function pdfResponse(c, { buffer, filename }) {
  return c.body(buffer, 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
  })
}

// service: optional override (tests).
export function registerLmsCertRoutes(app, { prisma, requirePermission, signFile = null, supabaseAdmin = null, bucket = 'runly-files', run, service = null }) {
  const certs = service ?? createLmsCertService({ prisma, signFile, supabaseAdmin, bucket })
  const access = requirePermission('lms.access')
  const courses = requirePermission('lms.course.manage')
  const enrollments = requirePermission('lms.enrollment.manage')
  const id = (c) => c.req.param('id')

  // ---- templates ----------------------------------------------------------
  // officeAvailable: false means Word templates render with the built-in design.
  app.get('/lms/certificate-templates', courses, run('Error al cargar las plantillas.', async (c) => c.json({
    data: await certs.listTemplates(companyId(c)), officeAvailable: certs.officeAvailable?.() ?? false,
    placeholders: CERT_DOCX_PLACEHOLDERS, fieldKeys: CERT_FIELD_KEYS,
  })))
  app.post('/lms/certificate-templates', courses, run('Error al crear la plantilla.', async (c) => c.json({ data: await certs.createTemplate(companyId(c), actorId(c), await body(c)) }, 201)))
  app.patch('/lms/certificate-templates/:id', courses, run('Error al guardar la plantilla.', async (c) => c.json({ data: await certs.updateTemplate(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/certificate-templates/:id', courses, run('Error al desactivar la plantilla.', async (c) => c.json({ data: await certs.disableTemplate(companyId(c), id(c)) })))
  // Uploaded templates (multipart: file, name, autoTag): .docx, .pptx or .pdf by
  // extension (/docx accepts Word only). Warnings come inside the template.
  // Unless autoTag=false, a Word/PowerPoint file without tags is saved with
  // suggested tags and a PDF with its detected fields; data.autoTag /
  // data.autoLayout describe what was recognized (null when not applied).
  const uploadRoute = (format) => run('Error al subir la plantilla.', async (c) => {
    const form = await c.req.formData()
    const result = await certs.uploadTemplateFile(companyId(c), actorId(c), { file: form.get('file'), name: form.get('name'), format, autoTag: wantsAutoTag(form.get('autoTag')) })
    return c.json({ data: { ...result.template, autoTag: result.autoTag ?? null, autoLayout: result.autoLayout ?? null } }, 201)
  })
  app.post('/lms/certificate-templates/upload', courses, uploadRoute(null))
  app.post('/lms/certificate-templates/docx', courses, uploadRoute('docx'))
  app.get('/lms/certificate-templates/sample.docx', courses, (c) => c.body(buildSampleCertificateDocx(), 200, {
    'Content-Type': DOCX_MIME, 'Content-Disposition': 'attachment; filename="plantilla-certificado-ejemplo.docx"',
  }))
  app.get('/lms/certificate-templates/sample.pptx', courses, (c) => c.body(buildSampleCertificatePptx(), 200, {
    'Content-Type': PPTX_MIME, 'Content-Disposition': 'attachment; filename="plantilla-certificado-ejemplo.pptx"',
  }))
  // Same format as the current file.
  app.put('/lms/certificate-templates/:id/file', courses, run('Error al reemplazar la plantilla.', async (c) => {
    const form = await c.req.formData()
    return c.json({ data: (await certs.replaceTemplateFile(companyId(c), actorId(c), id(c), { file: form.get('file') })).template })
  }))
  // Word / PowerPoint: a copy with suggested tags ({ applied, missing, unplaced, fileName, contentBase64 }).
  app.post('/lms/certificate-templates/:id/suggest', courses, run('No se pudieron sugerir etiquetas.', async (c) => c.json({ data: await certs.suggestTemplateTags(companyId(c), id(c)) })))
  app.get('/lms/certificate-templates/:id/file', courses, run('Error al descargar la plantilla.', async (c) => c.json({ data: await certs.templateFileUrl(companyId(c), id(c)) })))
  // PDF: field layout ({ fields }) and detected fields ({ page, fields, matched, defaulted, missing }).
  app.put('/lms/certificate-templates/:id/layout', courses, run('Error al guardar los campos.', async (c) => c.json({ data: await certs.saveTemplateLayout(companyId(c), id(c), await body(c)) })))
  app.post('/lms/certificate-templates/:id/suggest-layout', courses, run('No se pudieron detectar los campos.', async (c) => c.json({ data: await certs.suggestTemplateLayout(companyId(c), id(c)) })))
  app.get('/lms/certificate-templates/:id/preview.pdf', courses, run('Error al generar la vista previa.', async (c) => pdfResponse(c, await certs.previewPdf(companyId(c), id(c)))))
  // Preview of an unsaved PDF layout ({ layout }), sample data.
  app.post('/lms/certificate-templates/:id/preview.pdf', courses, run('Error al generar la vista previa.', async (c) => {
    const { layout = null } = await body(c)
    return pdfResponse(c, await certs.previewPdf(companyId(c), id(c), { layout }))
  }))

  // ---- issued certificates ------------------------------------------------
  app.post('/lms/enrollments/:id/certificate', enrollments, run('Error al emitir el certificado.', async (c) => c.json({ data: await certs.issueManual(companyId(c), actorId(c), id(c)) }, 201)))
  app.post('/lms/certificates/:id/revoke', enrollments, run('Error al revocar el certificado.', async (c) => c.json({ data: await certs.revoke(companyId(c), id(c), await body(c)) })))
  app.get('/lms/courses/:id/certificates', enrollments, run('Error al cargar los certificados.', async (c) => c.json({ data: await certs.listCourseCertificates(companyId(c), id(c)) })))
  app.get('/lms/certificates/:id/pdf', enrollments, run('Error al generar el certificado.', async (c) => pdfResponse(c, await certs.managerPdf(companyId(c), id(c)))))

  // ---- learner ------------------------------------------------------------
  app.get('/lms/my/certificates', access, run('Error al cargar tus certificados.', async (c) => c.json({ data: await certs.myCertificates(companyId(c), actorId(c)) })))
  app.get('/lms/my/certificates/:id/pdf', access, run('Error al generar el certificado.', async (c) => pdfResponse(c, await certs.myCertificatePdf(companyId(c), actorId(c), id(c)))))
}
