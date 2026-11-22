// What the person reviewed for evaluation targets (editable fields, never
// timestamps), so unrelated proposals of the same evaluation do not turn each
// other stale. Returns undefined for targets that are not evaluation-specific.
import { createHash } from 'node:crypto';
import { readAssessmentSettings } from '../../routes/lms/lms-assessment-core.js';
import { normalizeAssessmentShareSettings } from '../../routes/lms/lms-assessment-share-core.js';
import { userOf } from './lms-assessment-common.js';

const fingerprint = value => value ? createHash('sha256').update(String(value)).digest('hex').slice(0, 8) : null;

export function createAssessmentRevision({ prisma, find, admin }) {
  return async function revision(prepared, a) {
    const id = prepared.targetId;
    switch (prepared.targetType) {
      case 'assessment': { const row = await find.assessment(a, id); return { title: row.title, summary: row.summary, description: row.description, status: row.status, settings: readAssessmentSettings(row.settings) }; }
      case 'activity': { const row = await find.activity(a, id); return { title: row.title, body: row.body, kind: row.kind, settings: row.settings ?? {} }; }
      case 'activities': return (await prisma.lmsLesson.findMany({ where: { courseId: id, companyId: a.companyId, enabled: true, sectionId: null }, select: { id: true }, orderBy: { id: 'asc' } })).map(row => row.id);
      case 'share': { const row = await find.assessment(a, id); return { enabled: row.shareEnabled === true, settings: normalizeAssessmentShareSettings(row.shareSettings), link: fingerprint(row.shareToken) }; }
      case 'graders': return (await admin.listGraders(a.companyId, userOf(a), id)).map(row => ({ userProfileId: row.userProfileId, role: row.role })).sort((x, y) => x.userProfileId.localeCompare(y.userProfileId));
      case 'resource': { const { row } = await find.resource(a, id); return { title: row.title, fileId: row.fileId, activityId: row.lessonId }; }
      default: return undefined;
    }
  };
}
