import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeService } from '../office/service.js';
import { ids, officeBytes, officeEnv, officeFixture } from './office-fixture.js';

const status = expected => error => error.status === expected;
const LEARNER = '01990000-0000-7000-8000-000000000010';
const fetchImpl = async () => new Response('<wopi-discovery><net-zone><app><action ext="docx" name="edit" urlsrc="http://collabora:9980/browser/hash/cool.html?"/></app></net-zone></wopi-discovery>');
const role = keys => ({ key: 'employee', enabled: true, permissions: keys.map(key => ({ permission: { key, active: true } })) });

// officeFixture() with the file turned into a runly.lms FileAsset and the
// LMS lookups the access check needs.
async function lmsFixture(entityType, { permissions, learnerProfileId = LEARNER, templateSource = 'docx', onFileAssetSaved = null } = {}) {
  const f = await officeFixture();
  Object.assign(f.state.file, { moduleKey: 'runly.lms', entityType, accessScope: 'COMPANY', uploadedById: null, metadata: { companyId: ids.company, guestLearnerId: 'g1' } });
  f.state.role = role(permissions);
  f.state.template = { id: 't1', source: templateSource, fileAssetId: ids.file, companyId: ids.company, placeholders: [] };
  f.prisma.lmsSubmission = { findFirst: async ({ where }) => (where.companyId === ids.company && where.fileIds.has === ids.file
    ? { id: 's1', enrollment: { learner: { userProfileId: learnerProfileId } } } : null) };
  f.prisma.lmsCertificateTemplate = {
    findFirst: async ({ where }) => (where.companyId === ids.company && where.fileAssetId === f.state.template.fileAssetId ? structuredClone(f.state.template) : null),
    update: async ({ data }) => Object.assign(f.state.template, data),
  };
  const service = createOfficeService({ prisma: f.prisma, supabaseAdmin: f.supabaseAdmin, env: officeEnv, fetchImpl, onFileAssetSaved });
  const session = mode => service.createSession({ authUserId: ids.auth, fileId: ids.file, mode });
  return { ...f, service, session };
}

test('graders open submission files read-only without runly.files permissions, guests included', async () => {
  const f = await lmsFixture('LmsSubmission', { permissions: ['lms.grade'] });
  const opened = await f.session('auto');
  assert.equal(opened.mode, 'view');
  await assert.rejects(f.session('edit'), status(403));
  const info = await f.service.checkFileInfo({ fileId: ids.file, token: opened.accessToken });
  assert.equal(info.UserCanWrite, false);
});

test('the learner opens their own submission file; other learners and outsiders cannot', async () => {
  const own = await lmsFixture('LmsSubmission', { permissions: ['lms.access'], learnerProfileId: ids.profile });
  assert.equal((await own.session('auto')).mode, 'view');
  const other = await lmsFixture('LmsSubmission', { permissions: ['lms.access'] });
  await assert.rejects(other.session('auto'), status(403));
  const filesOnly = await lmsFixture('LmsSubmission', { permissions: ['files.assets.read', 'files.assets.update'] });
  await assert.rejects(filesOnly.session('view'), status(403));
  const foreign = await lmsFixture('LmsSubmission', { permissions: ['lms.grade'] });
  foreign.state.file.metadata = { companyId: ids.other };
  await assert.rejects(foreign.session('view'), status(403));
});

test('certificate templates open editable with lms.course.manage and only while current', async () => {
  const f = await lmsFixture('LmsCertificateTemplate', { permissions: ['lms.course.manage'] });
  assert.equal((await f.session('auto')).mode, 'edit');
  const grader = await lmsFixture('LmsCertificateTemplate', { permissions: ['lms.grade'] });
  await assert.rejects(grader.session('view'), status(403));
  f.state.template.fileAssetId = ids.other; // replaced by a newer upload
  await assert.rejects(f.session('view'), status(403));
});

test('saving a template through WOPI runs the save hook with the new bytes', async () => {
  const calls = [];
  const f = await lmsFixture('LmsCertificateTemplate', { permissions: ['lms.course.manage'], onFileAssetSaved: async args => { calls.push(args); throw new Error('hook failures never fail the save'); } });
  const { accessToken: token } = await f.session('edit');
  await f.service.lock({ fileId: ids.file, token, operation: 'LOCK', lock: 'L1' });
  const bytes = await officeBytes('docx', 'Editado');
  const saved = await f.service.putFile({ fileId: ids.file, token, bytes, lock: 'L1' });
  assert.equal(saved.version, '2');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].companyId, ids.company);
  assert.equal(calls[0].file.id, ids.file);
  assert.ok(calls[0].bytes.equals(bytes));
});
