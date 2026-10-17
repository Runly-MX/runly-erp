import assert from 'node:assert/strict';
import { ATTACHMENT_TARGETS } from '../attachment-targets.js';
import { createMcpCapabilities } from '../capabilities.js';
import { createMcpState, digest, nonce } from '../state.js';
import { createFilesService } from '../../services/files-service.js';
import { createCanvasService } from '../../routes/canvas/canvas-service.js';
import { createProjectsService } from '../../routes/projects/projects-service.js';
import { createNotesService } from '../../routes/notes/notes-service.js';

export async function moduleAttachmentTests(t, { prisma, config, auth, company, other, user, role, request, webToken, ids, wallet, account }) {
  for (const key of new Set(ATTACHMENT_TARGETS.flatMap(target => [target.readPermission, target.writePermission]).filter(Boolean))) {
    const permission = await prisma.permission.upsert({ where: { key }, create: { key, name: key }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
  const item = await prisma.invItem.create({ data: { companyId: company.id, name: 'Adjuntos transversales' } });
  const driver = await prisma.fleetDriver.create({ data: { companyId: company.id, firstName: 'Conductor', lastName: 'MCP', phone: '5550000000', licenseNumber: 'TEST-MCP' } });
  const report = await prisma.fleetReport.create({ data: { companyId: company.id, vehicleId: ids.fleet, reportType: 'maintenance', title: 'Servicio de prueba', reportDate: new Date('2026-10-16') } });
  const purchaseCase = await prisma.purchaseCase.findFirst({ where: { companyId: company.id } });
  const common = { companyId: company.id, caseId: purchaseCase.id, createdById: user.id };
  const purchaseRequest = await prisma.purchaseRequest.findFirst({ where: { companyId: company.id } });
  const quote = await prisma.purchaseQuote.create({ data: { ...common, supplierId: ids.contacts, issueDate: new Date('2026-10-16') } });
  const order = await prisma.purchaseOrder.create({ data: { ...common, supplierId: ids.contacts, number: 'MCP-ATTACH-ORDER', sequence: 9001, issueDate: new Date('2026-10-16') } });
  const invoice = await prisma.purchaseInvoice.create({ data: { ...common, supplierId: ids.contacts, number: 'MCP-ATTACH-INVOICE', sequence: 9001, issueDate: new Date('2026-10-16') } });
  const receipt = await prisma.purchaseReceipt.create({ data: { companyId: company.id, caseId: purchaseCase.id, orderId: order.id, receivedById: user.id, number: 'MCP-ATTACH-RECEIPT', sequence: 9001, receivedAt: new Date('2026-10-16') } });
  const hotspot = await prisma.canvasHotspot.findFirst({ where: { boardId: ids.board } });
  const person = await prisma.attPerson.create({ data: { companyId: company.id, code: 'MCP-ATTACH', firstName: 'Persona de referencia' } });
  const activity = await prisma.activity.create({ data: { companyId: company.id, actorId: user.id, type: 'test.reference', summary: 'Actividad propia de prueba' } });
  const [conversation] = await prisma.$queryRaw`SELECT id FROM chat_conversations WHERE company_id = ${company.id}::uuid AND title = 'Conversación propia'`;
  const file = await prisma.fileAsset.findFirst({ where: { entityId: company.id, entityType: 'AtlasFile', uploadedById: user.id, enabled: true } });
  const targetIds = {
    'inventory.item': item.id, 'hr.employee': ids.hr, 'fleet.vehicle': ids.fleet, 'fleet.driver': driver.id, 'fleet.report': report.id, 'contacts.contact': ids.contacts,
    'purchases.request': purchaseRequest.id, 'purchases.quote': quote.id, 'purchases.order': order.id, 'purchases.invoice': invoice.id, 'purchases.receipt': receipt.id,
    'projects.task': ids.task, 'canvas.board': ids.board, 'canvas.hotspot': hotspot.id,
    'projects.project': ids.projects, 'notes.note': ids.notes, 'pfm.wallet': wallet.id, 'pfm.movement': ids.pfm, 'ledger.account': account.id, 'ledger.transaction': ids.ledger,
    'calendar.event': ids.calendar, 'attendance.person': person.id, 'identity.profile': user.id, 'activity.entry': activity.id, 'chat.conversation': conversation.id, 'documents.file': file.id, 'files.file': file.id,
  };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const storageObjects = new Map();
  const supabaseAdmin = { storage: { from: bucket => ({ upload: async (key, bytes) => { storageObjects.set(`${bucket}/${key}`, Buffer.from(bytes)); return { error: null }; }, remove: async keys => { keys.forEach(key => storageObjects.delete(`${bucket}/${key}`)); return { error: null }; } }) } };
  const capabilities = createMcpCapabilities({ prisma, config, supabaseAdmin, downloadFile: async () => ({ buffer: png }) });
  const files = type => [{ file_id: `original-${type}`, file_name: `${type}.png`, mime_type: 'image/png', download_url: 'https://files.example.test/original?signature=temporary' }];
  const prepare = (target, actor = auth) => capabilities.run('runly_files_import_prepare', { companyId: company.id, target, files: files(target.type) }, actor);
  const commit = (target, proposal, actor = auth) => capabilities.run('runly_files_import_commit', { companyId: company.id, proposalId: proposal.proposalId, files: files(target.type) }, actor);
  async function approve(proposal, value = true) { const response = await request(`/mcp/proposals/${proposal.proposalId}`, { approve: value }, webToken()); assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); }
  const activeContext = { companyId: company.id, profileId: user.id, isAdmin: false, permissionSet: new Set(ATTACHMENT_TARGETS.flatMap(target => [target.readPermission, target.writePermission]).filter(Boolean).concat(['files.assets.read'])) };

  for (const definition of ATTACHMENT_TARGETS) await t.test(`Adjuntos ${definition.type}: aprobación, relación ${definition.mode}, permisos e idempotencia`, async () => {
    const target = { type: definition.type, id: targetIds[definition.type] };
    assert.ok(target.id, definition.type);
    const p = await prepare(target);
    await assert.rejects(() => commit(target, p), { code: 'approval_required' });
    const missingScope = `${definition.moduleKey.slice(6)}:${definition.mode === 'native' ? 'write' : 'read'}`;
    await assert.rejects(() => prepare(target, { ...auth, scopes: auth.scopes.filter(scope => scope !== missingScope) }), { code: 'insufficient_scope' });
    assert.equal((await prepare(target)).proposalId, p.proposalId);
    await approve(p);
    const [result, retry] = await Promise.all([commit(target, p), commit(target, p)]);
    assert.deepEqual(retry, result);
    assert.equal(result.result.files.length, 1);
    assert.equal(result.result.mode, definition.mode);
    assert.deepEqual(result.result.target, target);
    const asset = await prisma.fileAsset.findUnique({ where: { id: result.result.files[0].id } });
    assert.equal(asset.entityId, company.id);
    assert.deepEqual(asset.metadata.mcpTarget, target);
    assert.equal(asset.metadata.sha256, digest(png));
    if (definition.mode === 'native') {
      assert.equal(asset.moduleKey, definition.moduleKey);
      assert.equal(asset.entityType, definition.entityType);
      assert.equal(asset.metadata.sourceEntityId, target.id);
      // Same Files query used by the generic ERP attachment panels.
      const listed = await createFilesService({ prisma }).list({ authUserId: auth.authUserId, activeContext, includeSignedUrls: false, query: { moduleKey: definition.moduleKey, entityType: definition.entityType, sourceEntityId: target.id } });
      assert.ok(listed.data.some(file => file.id === asset.id));
    } else {
      assert.equal(asset.accessScope, 'RESTRICTED');
      assert.equal(asset.moduleKey, 'runly.files');
      assert.equal(asset.entityType, 'AtlasFile');
      assert.equal(asset.metadata.sourceEntityId, null);
    }
    const listed = await capabilities.run('runly_files_query', { companyId: company.id, request: { operation: 'files_record_attachments', input: { target, page: 1, limit: 30 } } }, auth);
    assert.ok(listed.result.items.some(file => file.id === asset.id));
    assert.equal(JSON.stringify(listed).includes('temporary'), false);
    const permission = await prisma.permission.findUnique({ where: { key: definition.writePermission ?? definition.readPermission } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    await assert.rejects(() => commit(target, p), { code: 'permission_denied' });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  });
  await t.test('Adjuntos: asociaciones nativas visibles en documentos de Flota, tareas y Canvas', async () => {
    assert.equal(await prisma.fleetVehicleDocument.count({ where: { vehicleId: ids.fleet, companyId: company.id } }), 1);
    assert.equal(await prisma.fleetDriverDocument.count({ where: { driverId: driver.id, companyId: company.id } }), 1);
    assert.equal(await prisma.fleetReportDocument.count({ where: { reportId: report.id, companyId: company.id } }), 1);
    assert.equal(await prisma.canvasAttachment.count({ where: { boardId: ids.board, companyId: company.id } }), 2);
    assert.equal(await prisma.fileAsset.count({ where: { entityId: company.id, entityType: 'Task', metadata: { path: ['sourceEntityId'], equals: ids.task } } }), 1);
    for (const bytes of storageObjects.values()) assert.deepEqual(bytes, png);
  });
  await t.test('Adjuntos: catálogo completo, sin destinos inventados ni módulos deshabilitados', async () => {
    const run = () => capabilities.run('runly_files_query', { companyId: company.id, request: { operation: 'files_attachment_targets', input: {} } }, auth);
    const result = await run();
    assert.equal(result.result.targets.length, ATTACHMENT_TARGETS.length);
    const module = await prisma.runlyModule.findUnique({ where: { key: 'runly.fleet' } });
    await prisma.companyModule.update({ where: { companyId_moduleId: { companyId: company.id, moduleId: module.id } }, data: { enabled: false } });
    assert.equal((await run()).result.targets.some(target => target.moduleKey === 'runly.fleet'), false);
    await assert.rejects(() => prepare({ type: 'fleet.vehicle', id: ids.fleet }), { code: 'module_unavailable' });
    await prisma.companyModule.update({ where: { companyId_moduleId: { companyId: company.id, moduleId: module.id } }, data: { enabled: true } });
    for (const type of ['fleet.vehicle', 'hr.employee', 'purchases.order', 'contacts.contact']) await assert.rejects(() => prepare({ type, id: other.id }), { code: 'not_found' });
  });
  await t.test('Adjuntos: conflictos, workflow de Compras y referencias privadas no convierten lecturas en escrituras', async () => {
    const target = { type: 'fleet.vehicle', id: ids.fleet };
    const p = await prepare(target);
    await prisma.fleetVehicle.update({ where: { id: ids.fleet }, data: { plate: 'MCP-ATTACH-UPDATED' } });
    const newer = await prepare(target);
    await approve(newer);
    await prisma.fleetVehicle.update({ where: { id: ids.fleet }, data: { plate: 'MCP-ATTACH-CHANGED' } });
    await assert.rejects(() => commit(target, newer), { code: 'proposal_stale' });
    assert.notEqual(newer.proposalId, p.proposalId);
    const workflow = await prisma.purchaseWorkflow.findFirst({ where: { companyId: company.id, isDefault: true } });
    await prisma.purchaseWorkflow.update({ where: { id: workflow.id }, data: { capabilities: { ...workflow.capabilities, invoices: false } } });
    await assert.rejects(() => prepare({ type: 'purchases.invoice', id: invoice.id }), error => error.status === 409);
    await prisma.purchaseWorkflow.update({ where: { id: workflow.id }, data: { capabilities: workflow.capabilities } });
    const notes = await prisma.$queryRaw`SELECT content, updated_at FROM notes WHERE id = ${ids.notes}::uuid`;
    const before = notes[0];
    const ref = await prepare({ type: 'notes.note', id: ids.notes });
    if (!(await capabilities.proposalInfo(auth.authUserId, ref.proposalId)).completed) await approve(ref);
    await commit({ type: 'notes.note', id: ids.notes }, ref);
    assert.deepEqual((await prisma.$queryRaw`SELECT content, updated_at FROM notes WHERE id = ${ids.notes}::uuid`)[0], before);
  });
  await t.test('Adjuntos: recursos privados ajenos y roles de solo lectura no permiten asociaciones nativas', async () => {
    const foreign = await prisma.userProfile.findFirst({ where: { email: 'other-mcp@example.test' } });
    const project = await createProjectsService({ prisma }).createProject(company.id, foreign.id, { name: 'Proyecto privado de adjuntos' });
    await assert.rejects(() => prepare({ type: 'projects.project', id: project.id }), { code: 'not_found' });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarea privada', position: 0, createdBy: foreign.id, statusId: (await prisma.taskStatus.findFirst({ where: { projectId: project.id } })).id } });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: 'VIEWER' } });
    await assert.rejects(() => prepare({ type: 'projects.task', id: task.id }), { code: 'permission_denied' });
    const board = await createCanvasService({ prisma }).createBoard(company.id, foreign.id, { name: 'Board privado de adjuntos' });
    await assert.rejects(() => prepare({ type: 'canvas.board', id: board.id }), { code: 'not_found' });
    await prisma.canvasCollaborator.create({ data: { boardId: board.id, userId: user.id, role: 'VIEWER', createdBy: foreign.id } });
    await assert.rejects(() => prepare({ type: 'canvas.board', id: board.id }), { code: 'permission_denied' });
    const note = await createNotesService({ prisma }).createNote({ userId: foreign.id, companyId: company.id, title: 'Referencia privada ajena' });
    await assert.rejects(() => prepare({ type: 'notes.note', id: note.id }), { code: 'not_found' });
    await assert.rejects(() => prepare({ type: 'activity.entry', id: other.id }), { code: 'not_found' });
    const [hidden] = await prisma.$queryRaw`SELECT id FROM chat_conversations WHERE company_id = ${company.id}::uuid AND title = 'Privada sin membresía'`;
    await assert.rejects(() => prepare({ type: 'chat.conversation', id: hidden.id }), error => [403, 404].includes(error.status));
    for (const [target, native] of [[{ type: 'projects.task', id: ids.task }, true], [{ type: 'notes.note', id: ids.notes }, false]]) {
      const restricted = await prisma.fileAsset.create({ data: { entityId: company.id, moduleKey: native ? 'runly.projects' : 'runly.files', entityType: native ? 'Task' : 'AtlasFile', uploadedById: foreign.id, accessScope: 'RESTRICTED', bucket: 'test-files', objectKey: `private-${target.type}`, originalName: 'Archivo restringido ajeno.png', mimeType: 'image/png', sizeBytes: 100, metadata: native ? { sourceEntityId: target.id } : { mcpTarget: target } } });
      const result = await capabilities.run('runly_files_query', { companyId: company.id, request: { operation: 'files_record_attachments', input: { target, page: 1, limit: 50 } } }, auth);
      assert.equal(result.result.items.some(file => file.id === restricted.id), false);
    }
  });
  await t.test('Adjuntos: propuestas v3 anteriores de Inventario conservan aprobación y commit', async () => {
    const prepared = await prepare({ type: 'inventory.item', id: item.id });
    const current = (await createMcpState(prisma).get('proposal', prepared.proposalId)).payload;
    const { destination, result, ...legacy } = current;
    assert.ok(destination && result);
    legacy.target = { id: current.target.id, name: current.target.name, updatedAt: current.target.updatedAt };
    legacy.approved = false;
    const id = nonce();
    await createMcpState(prisma).put('proposal', id, legacy, 600);
    await approve({ proposalId: id });
    const committed = await commit({ type: 'inventory.item', id: item.id }, { proposalId: id });
    assert.equal(committed.result.itemId, item.id);
  });
  await t.test('Adjuntos de Compras: XML original se vincula a factura sin reconocer ni modificar importes', async () => {
    const xml = Buffer.from('<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="https://schema.example.test/cfdi" Total="850"/>');
    const caps = createMcpCapabilities({ prisma, config, supabaseAdmin, downloadFile: async () => ({ buffer: xml }) });
    const original = [{ file_id: 'invoice-original-xml', file_name: 'factura.xml', mime_type: 'application/xml', download_url: 'https://files.example.test/factura' }];
    const before = await prisma.purchaseInvoice.findUnique({ where: { id: invoice.id } });
    const p = await caps.run('runly_files_import_prepare', { companyId: company.id, target: { type: 'purchases.invoice', id: invoice.id }, files: original }, auth);
    await approve(p);
    const result = await caps.run('runly_files_import_commit', { companyId: company.id, proposalId: p.proposalId, files: original }, auth);
    const asset = await prisma.fileAsset.findUnique({ where: { id: result.result.files[0].id } });
    assert.equal(asset.entityType, 'purchase_invoice');
    assert.equal(asset.metadata.sourceEntityId, invoice.id);
    assert.deepEqual(storageObjects.get(`${asset.bucket}/${asset.objectKey}`), xml);
    assert.deepEqual(await prisma.purchaseInvoice.findUnique({ where: { id: invoice.id } }), before);
  });
  await t.test('Adjuntos: retirar permiso durante la carga revierte metadatos, relaciones y objetos', async () => {
    const permission = await prisma.permission.findUnique({ where: { key: 'hr.employee.update' } });
    const storage = { from: bucket => ({ ...supabaseAdmin.storage.from(bucket), upload: async (key, bytes) => {
      const result = await supabaseAdmin.storage.from(bucket).upload(key, bytes);
      await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
      return result;
    } }) };
    const caps = createMcpCapabilities({ prisma, config, supabaseAdmin: { storage }, downloadFile: async () => ({ buffer: png }) });
    const original = [{ ...files('hr.employee')[0], file_id: 'permission-race', file_name: 'permission-race.png' }];
    const p = await caps.run('runly_files_import_prepare', { companyId: company.id, target: { type: 'hr.employee', id: ids.hr }, files: original }, auth);
    await approve(p);
    const count = await prisma.fileAsset.count(), stored = storageObjects.size;
    try { await assert.rejects(() => caps.run('runly_files_import_commit', { companyId: company.id, proposalId: p.proposalId, files: original }, auth), { code: 'permission_denied' }); }
    finally { await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} }); }
    assert.equal(await prisma.fileAsset.count(), count);
    assert.equal(storageObjects.size, stored);
    assert.equal(Boolean((await createMcpState(prisma).get('proposal', p.proposalId)).payload.result), false);
  });
  // The legacy Inventory suite keeps its original fixture count assertions.
  await prisma.invItem.delete({ where: { id: item.id } });
  const states = await prisma.mcpState.findMany({ where: { kind: 'proposal', payload: { path: ['destination', 'type'], equals: 'hr.employee' } } });
  assert.ok(states.length > 0);
  // All persisted references contain IDs/hashes, never the temporary URL.
  assert.equal(JSON.stringify(states).includes('signature=temporary'), false);
  assert.ok(await createMcpState(prisma).get('grant', auth.grantId));
}
