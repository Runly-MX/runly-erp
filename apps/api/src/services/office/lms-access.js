import { OfficeError } from './errors.js';

// runly.lms FileAssets that Office can open. Both are uploaded with
// entityId = companyId and metadata.companyId (see routes/lms/lms-media.js and
// lms-cert-templates.js), so the company comes from the row itself.
//  - LmsSubmission: read-only, for graders (lms.grade) and the learner who
//    submitted it (lms.access). Guest submissions have no uploader profile;
//    access is decided by the submission that lists the file, never by uploader.
//  - LmsCertificateTemplate: editable with lms.course.manage, only while the
//    file is the template's current one (replaced files are refused).
const LMS_OFFICE_ENTITIES = new Set(['LmsSubmission', 'LmsCertificateTemplate']);
const TAGGED_SOURCES = new Set(['docx', 'pptx']);

export function isLmsOfficeFile(file) {
  return file?.moduleKey === 'runly.lms' && LMS_OFFICE_ENTITIES.has(file.entityType);
}

export async function authorizeLmsOfficeFile({ db, file, companyId, profile, can, mode }) {
  const deny = (message = 'No tienes acceso al documento.', code = 'forbidden') => new OfficeError(message, 403, code);
  if (file.metadata?.companyId !== companyId || file.metadata?.pending) throw deny();
  if (file.entityType === 'LmsCertificateTemplate') {
    if (!can('lms.course.manage')) throw deny('No tienes permiso para abrir esta plantilla.');
    const template = await db.lmsCertificateTemplate.findFirst({ where: { companyId, fileAssetId: file.id }, select: { id: true, source: true } });
    if (!template || !TAGGED_SOURCES.has(template.source)) throw deny('Esta plantilla ya no usa este archivo.', 'unsupported_scope');
    return;
  }
  if (mode === 'edit') throw deny('Las entregas se abren en solo lectura.', 'read_only');
  const submission = await db.lmsSubmission.findFirst({
    where: { companyId, fileIds: { has: file.id } },
    select: { id: true, enrollment: { select: { learner: { select: { userProfileId: true } } } } },
  });
  if (!submission) throw deny();
  if (can('lms.grade')) return;
  if (can('lms.access') && submission.enrollment?.learner?.userProfileId === profile.id) return;
  throw deny();
}
