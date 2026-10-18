import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMinimalDocx, paragraph } from '../../services/document-templates/minimal-docx.js';
import { buildSampleCertificateDocx } from '../../routes/lms/lms-cert-docx.js';
import { createLmsCertActions } from '../adapters/lms-cert-actions.js';
import { officeType } from '../file-import.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FILE_ID = '01900000-0000-7000-8000-000000000050';
const a = { companyId: 'c1', actorProfileId: 'p1' };
const untagged = () => buildMinimalDocx([
  paragraph('Se otorga la presente constancia a ______________ por haber concluido el curso ______________'),
  paragraph('Fecha: [FECHA]'),
].join(''));

function setup(buffer) {
  const stored = [], rows = [];
  const prisma = {
    lmsCertificateTemplate: { create: async ({ data }) => { const row = { id: 't1', enabled: true, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return row; } },
    fileAsset: { update: async () => ({}) },
    lmsCourse: { count: async () => 0 },
  };
  const sources = { get: async (_a, id) => (id === FILE_ID ? { id, originalName: 'Constancia.docx', mimeType: DOCX, enabled: true } : null), read: async () => buffer };
  const certFiles = { store: async args => { stored.push(args); return { id: 'f1', metadata: {} }; } };
  const [action] = createLmsCertActions({ prisma, sources, certFiles });
  return { action, stored, rows };
}

test('lms.certificate_template.create: propuesta con campos reconocidos y plantilla guardada con etiquetas', async () => {
  const { action, stored, rows } = setup(untagged());
  assert.match(action.description, /\{\{alumno\}\}/);
  assert.match(action.description, /\{\{%qr\}\}/);
  const prepared = await action.prepare({ fileId: FILE_ID }, a);
  assert.equal(prepared.input.name, 'Constancia');
  assert.match(prepared.input.sha256, /^[a-f0-9]{64}$/);
  const placed = prepared.preview.fields.find(field => field.label === 'Etiquetas que se colocarán');
  assert.match(placed.value, /\{\{alumno\}\}/);
  assert.ok(prepared.preview.fields.some(field => field.label === 'No se encontró dónde poner' && /Folio/.test(field.value)));
  const result = await action.execute(prepared.input, a);
  assert.equal(result.source, 'docx');
  assert.equal(result.autoTagged, true);
  for (const tag of ['alumno', 'curso', 'fecha']) assert.ok(result.recognized.includes(tag), tag);
  assert.ok(result.missing.includes('folio'));
  assert.equal(stored[0].fileName, 'Constancia (con etiquetas).docx');
  assert.ok(rows[0].placeholders.includes('alumno'));
  await assert.rejects(() => action.execute({ ...prepared.input, sha256: '0'.repeat(64) }, a), { code: 'proposal_stale' });
  await assert.rejects(() => action.prepare({ fileId: '01900000-0000-7000-8000-000000000051' }, a), { code: 'not_found' });
});

test('lms.certificate_template.create: archivo con etiquetas o autoTag:false se guarda tal cual', async () => {
  const sample = buildSampleCertificateDocx();
  let h = setup(sample);
  let prepared = await h.action.prepare({ fileId: FILE_ID, name: 'Oficial' }, a);
  assert.ok(prepared.preview.fields.some(field => field.label === 'Etiquetas' && /\{\{%qr\}\}/.test(field.value)));
  await h.action.execute(prepared.input, a);
  assert.deepEqual(h.stored[0].buffer, sample);
  h = setup(untagged());
  prepared = await h.action.prepare({ fileId: FILE_ID, autoTag: false }, a);
  await h.action.execute(prepared.input, a);
  assert.deepEqual(h.rows[0].placeholders, []);
});

test('importación MCP: Word/PowerPoint reales sin macros', () => {
  assert.deepEqual(officeType(untagged()), [DOCX, '.docx']);
  assert.equal(officeType(Buffer.from('PK\u0003\u0004 not a zip')), null);
  assert.equal(officeType(Buffer.from('%PDF-1.7')), null);
});
