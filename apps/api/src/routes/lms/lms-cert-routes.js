// runly.lms certificate routes (internal), registered from createLmsRouter.
import { createLmsCertService } from './lms-cert-service.js'

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
export function registerLmsCertRoutes(app, { prisma, requirePermission, signFile = null, run, service = null }) {
  const certs = service ?? createLmsCertService({ prisma, signFile })
  const access = requirePermission('lms.access')
  const courses = requirePermission('lms.course.manage')
  const enrollments = requirePermission('lms.enrollment.manage')
  const id = (c) => c.req.param('id')

  // ---- templates ----------------------------------------------------------
  app.get('/lms/certificate-templates', courses, run('Error al cargar las plantillas.', async (c) => c.json({ data: await certs.listTemplates(companyId(c)) })))
  app.post('/lms/certificate-templates', courses, run('Error al crear la plantilla.', async (c) => c.json({ data: await certs.createTemplate(companyId(c), actorId(c), await body(c)) }, 201)))
  app.patch('/lms/certificate-templates/:id', courses, run('Error al guardar la plantilla.', async (c) => c.json({ data: await certs.updateTemplate(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/certificate-templates/:id', courses, run('Error al desactivar la plantilla.', async (c) => c.json({ data: await certs.disableTemplate(companyId(c), id(c)) })))
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
