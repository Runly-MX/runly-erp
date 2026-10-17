// runly.lms certificate routes (internal), registered from createLmsRouter.
import { createLmsCertService } from './lms-cert-service.js'
import { CERT_DOCX_PLACEHOLDERS, DOCX_MIME, buildSampleCertificateDocx } from './lms-cert-docx.js'

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
    data: await certs.listTemplates(companyId(c)), officeAvailable: certs.officeAvailable?.() ?? false, placeholders: CERT_DOCX_PLACEHOLDERS,
  })))
  app.post('/lms/certificate-templates', courses, run('Error al crear la plantilla.', async (c) => c.json({ data: await certs.createTemplate(companyId(c), actorId(c), await body(c)) }, 201)))
  app.patch('/lms/certificate-templates/:id', courses, run('Error al guardar la plantilla.', async (c) => c.json({ data: await certs.updateTemplate(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/certificate-templates/:id', courses, run('Error al desactivar la plantilla.', async (c) => c.json({ data: await certs.disableTemplate(companyId(c), id(c)) })))
  // Word templates (multipart: file, name). Warnings come inside the template.
  app.post('/lms/certificate-templates/docx', courses, run('Error al subir la plantilla.', async (c) => {
    const form = await c.req.formData()
    const result = await certs.uploadDocxTemplate(companyId(c), actorId(c), { file: form.get('file'), name: form.get('name') })
    return c.json({ data: result.template }, 201)
  }))
  app.get('/lms/certificate-templates/sample.docx', courses, (c) => c.body(buildSampleCertificateDocx(), 200, {
    'Content-Type': DOCX_MIME, 'Content-Disposition': 'attachment; filename="plantilla-certificado-ejemplo.docx"',
  }))
  app.put('/lms/certificate-templates/:id/file', courses, run('Error al reemplazar la plantilla.', async (c) => {
    const form = await c.req.formData()
    return c.json({ data: (await certs.replaceDocxTemplateFile(companyId(c), actorId(c), id(c), { file: form.get('file') })).template })
  }))
  app.post('/lms/certificate-templates/:id/suggest', courses, run('No se pudieron sugerir etiquetas.', async (c) => c.json({ data: await certs.suggestDocxTags(companyId(c), id(c)) })))
  app.get('/lms/certificate-templates/:id/file', courses, run('Error al descargar la plantilla.', async (c) => c.json({ data: await certs.docxTemplateFileUrl(companyId(c), id(c)) })))
  app.get('/lms/certificate-templates/:id/preview.pdf', courses, run('Error al generar la vista previa.', async (c) => pdfResponse(c, await certs.previewPdf(companyId(c), id(c)))))

  // ---- issued certificates ------------------------------------------------
  app.post('/lms/enrollments/:id/certificate', enrollments, run('Error al emitir el certificado.', async (c) => c.json({ data: await certs.issueManual(companyId(c), actorId(c), id(c)) }, 201)))
  app.post('/lms/certificates/:id/revoke', enrollments, run('Error al revocar el certificado.', async (c) => c.json({ data: await certs.revoke(companyId(c), id(c), await body(c)) })))
  app.get('/lms/courses/:id/certificates', enrollments, run('Error al cargar los certificados.', async (c) => c.json({ data: await certs.listCourseCertificates(companyId(c), id(c)) })))
  app.get('/lms/certificates/:id/pdf', enrollments, run('Error al generar el certificado.', async (c) => pdfResponse(c, await certs.managerPdf(companyId(c), id(c)))))

  // ---- learner ------------------------------------------------------------
  app.get('/lms/my/certificates', access, run('Error al cargar tus certificados.', async (c) => c.json({ data: await certs.myCertificates(companyId(c), actorId(c)) })))
  app.get('/lms/my/certificates/:id/pdf', access, run('Error al generar el certificado.', async (c) => pdfResponse(c, await certs.myCertificatePdf(companyId(c), actorId(c), id(c)))))
}
