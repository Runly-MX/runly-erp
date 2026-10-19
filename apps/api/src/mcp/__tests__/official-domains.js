import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { createCapabilityRegistry } from '../registry.js';
import { createMcpCapabilities } from '../capabilities.js';
import { createMcpOAuth } from '../oauth.js';
import { nonce, digest } from '../state.js';
import { SCOPES } from '../config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createProjectsService } from '../../routes/projects/projects-service.js';
import { createNotesService } from '../../routes/notes/notes-service.js';
import { createCanvasService } from '../../routes/canvas/canvas-service.js';
import { createPurchasesService } from '../../services/purchases-service.js';
import * as Y from 'yjs';
import { fileImportTests } from './file-import-cases.js';
import { moduleAttachmentTests } from './module-attachment-cases.js';

async function notesSchema(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // db push does not reproduce client-side uuid defaults as database defaults.
    // Production's original fleet/ledger migrations define server-generated IDs.
    for (const table of ['fleet_vehicle', 'fleet_driver', 'fleet_insurance_policy', 'ledger_transaction', 'fleet_vehicle_document', 'fleet_driver_document', 'fleet_report_document']) await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT uuidv7()`);
    for (const table of ['fleet_vehicle', 'fleet_driver', 'fleet_insurance_policy', 'fleet_vehicle_document', 'fleet_driver_document', 'fleet_report_document']) await client.query(`ALTER TABLE ${table} ALTER COLUMN updated_at SET DEFAULT now()`);
    for (const folder of ['20260627120000_atlas_notes_tables', '20260627130000_atlas_notes_fixes', '20260910182109_notes_canvas', '20260918120000_notes_paper_style', '20260919090000_notes_paper_effects', '20260919232806_notes_public_collaborators']) {
      await client.query(await readFile(new URL(`../../../../../prisma/migrations/${folder}/migration.sql`, import.meta.url), 'utf8'));
    }
    await client.query('ALTER TABLE note_shares ADD COLUMN external_access boolean NOT NULL DEFAULT false');
    const isolation = await readFile(new URL('../../../../../prisma/migrations/20260919140000_user_resource_isolation/migration.sql', import.meta.url), 'utf8');
    for (const sql of isolation.match(/CREATE FUNCTION public.runly_(?:member_active|note_user_access)\([\s\S]*?\$\$;/g)) await client.query(sql);
    // Minimal external Auth schema for the original Chat read-only joins.
    // Hono session/OAuth authentication is tested separately with signed fixtures.
    await client.query("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$");
    for (const folder of ['20260625000000_add_chat_tables', '20260629130000_chat_archive', '20260825000000_chat_channels_roles', '20260827000000_chat_threads', '20260827010000_chat_conversation_avatar', '20260828000000_chat_moderation', '20260907000000_chat_conversation_pin_hide']) {
      const sql = await readFile(new URL(`../../../../../prisma/migrations/${folder}/migration.sql`, import.meta.url), 'utf8');
      await client.query(sql.replace(/^ALTER PUBLICATION[^;]+;/gm, ''));
    }
    await client.query('ALTER TABLE chat_conversation_members ADD COLUMN external_access boolean NOT NULL DEFAULT false');
    for (const sql of isolation.match(/CREATE FUNCTION public.runly_chat_user_access\([\s\S]*?\$\$;/g)) await client.query(sql);
  } finally { await client.end(); }
}

export async function officialDomainTests(t, { prisma, url, config, company, other, user, authUserId, role, membership, request, webToken }) {
  await notesSchema(url);
  const registry = createCapabilityRegistry({ prisma });
  const permissions = [...new Set(registry.tools.flatMap(tool => tool.operations.flatMap(op => [op.permission, op.readPermission].filter(Boolean))))];
  for (const key of permissions) {
    const permission = await prisma.permission.upsert({ where: { key }, create: { key, name: key }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
  const modules = new Map();
  for (const key of registry.moduleKeys) {
    const first = registry.create(key).queries[0];
    modules.set(key, await prisma.runlyModule.create({ data: { key, name: key, version: '1.0.0', manifest: { acl: { module: first.permission } } } }));
  }
  const oauth = createMcpOAuth({ prisma, config }), capabilities = createMcpCapabilities({ prisma, config, oauth });
  const client = await oauth.register({ redirect_uris: ['http://127.0.0.1/domain-test'], grant_types: ['authorization_code', 'refresh_token'], application_type: 'native' });
  const verifier = nonce();
  const location = await oauth.authorize({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: config.resource, scope: SCOPES.join(' ') });
  const consent = await oauth.consent(authUserId, { requestId: new URL(location).searchParams.get('request'), companyIds: [company.id], approve: true });
  const tokens = await oauth.token({ grant_type: 'authorization_code', client_id: client.client_id, code: new URL(consent.redirect).searchParams.get('code'), redirect_uri: client.redirect_uris[0], code_verifier: verifier, resource: config.resource });
  const auth = await oauth.authenticate(tokens.access_token);
  await fileImportTests(t, { prisma, config, auth, company, other, user, role, request, webToken });
  const run = async (domain, mode, input, override = {}) => {
    const name = `runly_${domain}_${mode}`;
    const tool = registry.tools.find(tool => tool.name === name);
    const args = tool.inputSchema.parse({ companyId: company.id, ...input });
    return capabilities.run(name, args, { ...auth, ...override });
  };
  const prepare = (domain, operation, input) => run(domain, 'prepare', { request: { operation, input } });
  const commit = (domain, proposal) => run(domain, 'commit', { proposalId: proposal.proposalId });
  async function approve(proposal, value = true, acknowledgeSensitive = true) {
    const response = await request(`/mcp/proposals/${proposal.proposalId}`, { approve: value, acknowledgeSensitive }, webToken());
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  }
  const wallet = await prisma.pfmWallet.create({ data: { companyId: company.id, ownerId: user.id, name: 'Personal MCP', kind: 'CASH', currency: 'MXN' } });
  const category = await prisma.pfmCategory.create({ data: { companyId: company.id, ownerId: user.id, name: 'Mantenimiento MCP', kind: 'EXPENSE' } });
  const account = await prisma.ledgerAccount.create({ data: { companyId: company.id, ownerId: user.id, name: 'Cuenta MCP', bank: 'Efectivo' } });
  await prisma.calendarCalendar.create({ data: { companyId: company.id, ownerId: user.id, name: 'Agenda MCP', isDefault: true } });
  const cases = [
    { domain: 'hr', query: 'hr_employees_search', create: 'hr.employee.create', update: 'hr.employee.update', make: suffix => ({ data: { firstName: `Persona ${suffix}`, lastName: 'Prueba', userProfileId: user.id } }), change: id => ({ employeeId: id, data: { phone: '5550000000' } }), mutate: id => prisma.hrEmployee.update({ where: { id }, data: { phone: '5550000001' } }) },
    { domain: 'fleet', query: 'fleet_vehicles_search', create: 'fleet.vehicle.create', update: 'fleet.vehicle.update', make: suffix => ({ plate: `MCP-${suffix}`, brand: 'Marca de prueba' }), change: id => ({ vehicleId: id, color: 'Azul' }), mutate: id => prisma.fleetVehicle.update({ where: { id }, data: { color: 'Rojo' } }) },
    { domain: 'notes', query: 'notes_search', create: 'notes.note.create', update: 'notes.note.rename_move', make: suffix => ({ title: `Nota ${suffix}`, content: 'Acuerdos de mantenimiento' }), change: id => ({ noteId: id, title: 'Nota actualizada' }), mutate: id => prisma.$executeRaw`UPDATE notes SET title = 'Cambio concurrente', updated_at = now() WHERE id = ${id}::uuid` },
    { domain: 'pfm', query: 'pfm_list_wallets', create: 'pfm.movement.create', update: 'pfm.movement.update', make: suffix => ({ wallet: 'Personal MCP', direction: 'EXPENSE', amount: 850, category: 'Mantenimiento MCP', merchant: `Taller ${suffix}` }), change: id => ({ movementId: id, amount: 860 }), mutate: id => prisma.pfmMovement.update({ where: { id }, data: { amount: 855 } }) },
    { domain: 'ledger', query: 'ledger_accounts', create: 'ledger.transaction.create', update: 'ledger.transaction.update', make: suffix => ({ accountId: account.id, fecha: '2026-10-16', nombre: `Mantenimiento ${suffix}`, retiro: 850 }), change: id => ({ transactionId: id, nombre: 'Mantenimiento editado' }), mutate: id => prisma.ledgerTransaction.update({ where: { id }, data: { nombre: 'Cambio concurrente' } }) },
    { domain: 'projects', query: 'projects_list_projects', create: 'projects.project.create', update: 'projects.project.update', make: suffix => ({ data: { name: `Renovación ${suffix}` } }), change: id => ({ projectId: id, data: { name: 'Renovación de cámaras' } }), mutate: id => prisma.project.update({ where: { id }, data: { name: 'Cambio concurrente' } }) },
    { domain: 'calendar', query: 'calendar_calendars', create: 'calendar.event.create', update: 'calendar.event.update', make: suffix => ({ title: `Reunión ${suffix}`, start: '2026-10-19T10:00', end: '2026-10-19T11:00', calendar: 'Agenda MCP' }), change: id => ({ eventId: id, title: 'Reunión actualizada' }), mutate: id => prisma.calendarEvent.update({ where: { id }, data: { title: 'Cambio concurrente' } }) },
    { domain: 'contacts', query: 'contacts_search', create: 'contacts.contact.create', update: 'contacts.contact.update', make: suffix => ({ name: `Proveedor ${suffix}`, type: 'supplier' }), change: id => ({ contactId: id, phone: '5550000000' }), mutate: id => prisma.contact.update({ where: { id }, data: { phone: '5550000001' } }) },
  ];
  await t.test('hr: lote con supervisor; la revisión muestra el nombre actual en lugar de proposal_stale', async () => {
    const supervisor = await prisma.hrEmployee.create({ data: { companyId: company.id, firstName: 'Jose Luis', lastName: 'Lopez' } });
    const rename = await prepare('hr', 'hr.employee.update', { employeeId: supervisor.id, data: { firstName: 'José Luis', lastName: 'López' } });
    const report = await prepare('hr', 'hr.employee.create', { data: { firstName: 'Julio', lastName: 'Bahena', supervisorEmployeeId: supervisor.id } });
    await approve(rename);
    await commit('hr', rename);
    const info = await request(`/mcp/proposals/${report.proposalId}`, null, webToken());
    assert.equal(info.status, 200, JSON.stringify(await info.clone().json()));
    const detail = await info.json();
    assert.equal(detail.refreshed, true);
    assert.ok(JSON.stringify(detail.preview).includes('José Luis López'));
    await approve(report);
    await approve(report);
    const reverse = await request(`/mcp/proposals/${report.proposalId}`, { approve: false }, webToken());
    assert.equal(reverse.status, 409);
    assert.equal((await reverse.json()).error, 'already_decided');
    assert.equal((await (await request(`/mcp/proposals/${report.proposalId}`, null, webToken())).json()).approved, true);
    const created = await commit('hr', report);
    assert.equal((await request(`/mcp/proposals/${report.proposalId}`, { approve: false }, webToken())).status, 409);
    assert.equal((await prisma.hrEmployee.findUnique({ where: { id: created.result.id } })).supervisorEmployeeId, supervisor.id);
    const late = await prepare('hr', 'hr.employee.create', { data: { firstName: 'Edgar', lastName: 'Cisneros', supervisorEmployeeId: supervisor.id } });
    await approve(late);
    await prisma.hrEmployee.update({ where: { id: supervisor.id }, data: { lastName: 'López Martínez' } });
    assert.equal((await request(`/mcp/proposals/${late.proposalId}`, null, webToken())).status, 409);
    await assert.rejects(() => commit('hr', late), { code: 'proposal_stale' });
    // Later pagination assertions expect a single employee fixture.
    await prisma.hrEmployee.delete({ where: { id: created.result.id } });
    await prisma.hrEmployee.delete({ where: { id: supervisor.id } });
  });
  const ids = {};
  await createPurchasesService({ prisma }).updateSettings(company.id, user.id, { preset: 'CUSTOM', capabilities: { requests: true, approvals: true, purchaseOrders: true, invoices: true, receipts: true, quotes: true } });
  for (const item of cases) await t.test(`${item.domain}: lectura, scopes/permisos, empresa/módulo, aprobación/rechazo, altas/ediciones, concurrencia e idempotencia`, async () => {
    const queryArgs = { request: { operation: item.query, input: {} } };
    const result = await run(item.domain, 'query', queryArgs);
    assert.equal(result.operation, item.query);
    await assert.rejects(() => run(item.domain, 'query', queryArgs, { scopes: ['runly:read'] }), { code: 'insufficient_scope' });
    await assert.rejects(() => capabilities.run(`runly_${item.domain}_query`, { companyId: other.id, ...queryArgs }, auth), { code: 'company_not_granted' });
    const module = modules.get(`runly.${item.domain}`);
    await prisma.companyModule.upsert({ where: { companyId_moduleId: { companyId: company.id, moduleId: module.id } }, create: { companyId: company.id, moduleId: module.id, enabled: false }, update: { enabled: false } });
    await assert.rejects(() => run(item.domain, 'query', queryArgs), { code: 'module_unavailable' });
    await prisma.companyModule.update({ where: { companyId_moduleId: { companyId: company.id, moduleId: module.id } }, data: { enabled: true } });
    const permissionKey = registry.create(module.key).queries.find(q => q.name === item.query).permission;
    const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    await assert.rejects(() => run(item.domain, 'query', queryArgs), { code: 'permission_denied' });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const denied = await prepare(item.domain, item.create, item.make('A'));
    assert.equal((await prepare(item.domain, item.create, item.make('A'))).proposalId, denied.proposalId);
    await assert.rejects(() => commit(item.domain, denied), { code: 'approval_required' });
    await approve(denied, false);
    await assert.rejects(() => commit(item.domain, denied), { code: 'approval_required' });
    const proposal = await prepare(item.domain, item.create, item.make('B'));
    const info = await request(`/mcp/proposals/${proposal.proposalId}`, null, webToken());
    assert.equal(info.status, 200, JSON.stringify(await info.clone().json()));
    if ((await info.json()).sensitive) assert.equal((await request(`/mcp/proposals/${proposal.proposalId}`, { approve: true }, webToken())).status, 403);
    await approve(proposal);
    const [created, concurrent] = await Promise.all([commit(item.domain, proposal), commit(item.domain, proposal)]);
    assert.deepEqual(concurrent, created);
    assert.equal(await prisma.auditLog.count({ where: { moduleKey: `runly.${item.domain}`, action: `mcp.${item.create}`, metadata: { path: ['proposalHash'], equals: digest(proposal.proposalId) } } }), 1);
    assert.deepEqual(await commit(item.domain, proposal), created);
    ids[item.domain] = created.result.id;
    assert.ok(ids[item.domain], JSON.stringify(created));
    const stale = await prepare(item.domain, item.update, item.change(ids[item.domain]));
    await approve(stale);
    await item.mutate(ids[item.domain]);
    await assert.rejects(() => commit(item.domain, stale), { code: 'proposal_stale' });
    const update = await prepare(item.domain, item.update, item.change(ids[item.domain]));
    await approve(update);
    const updated = await commit(item.domain, update);
    assert.deepEqual(await commit(item.domain, update), updated);
    const key = registry.create(module.key).actions.find(a => a.key === item.update).permission;
    const p = await prisma.permission.findUnique({ where: { key } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } } });
    await assert.rejects(() => commit(item.domain, update), { code: 'permission_denied' });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
  });
  await t.test('PFM: presupuesto propio validado, aprobado y editable', async () => {
    const proposal = await prepare('pfm', 'pfm.budget.create', { data: { categoryId: category.id, amount: 2000 } });
    await approve(proposal);
    const created = await commit('pfm', proposal);
    const update = await prepare('pfm', 'pfm.budget.update', { budgetId: created.result.id, data: { amount: 2500 } });
    await approve(update);
    assert.equal(Number((await commit('pfm', update)).result.amount), 2500);
  });
  await t.test('RH: duplicados, vínculo por ID explícito y cuenta ajena rechazados', async () => {
    const eligible = await run('hr', 'query', { request: { operation: 'hr_users_eligible', input: {} } });
    assert.equal(eligible.result.items.some(person => person.id === user.id), false);
    const current = await run('hr', 'query', { request: { operation: 'hr_users_eligible', input: { employeeId: ids.hr } } });
    assert.equal(current.result.items.some(person => person.id === user.id), true);
    await assert.rejects(() => prepare('hr', 'hr.employee.create', { data: { firstName: 'Persona B', lastName: 'Prueba' } }), { code: 'duplicate_resource' });
    await assert.rejects(() => prepare('hr', 'hr.employee.create', { data: { firstName: 'Otra persona', lastName: 'Prueba', userProfileId: user.id } }), { status: 409 });
    await assert.rejects(() => prepare('hr', 'hr.employee.create', { data: { firstName: 'Otra persona', lastName: 'Prueba', userProfileId: other.id } }), { status: 400 });
    assert.throws(() => registry.tools.find(tool => tool.name === 'runly_hr_prepare').inputSchema.parse({ companyId: company.id, request: { operation: 'hr.employee.create', input: { data: { firstName: 'Otra persona', lastName: 'Prueba', userName: user.displayName } } } }));
  });
  await t.test('Flota: póliza real consultable y editable con aprobación', async () => {
    const proposal = await prepare('fleet', 'fleet.insurance.create', { vehicleId: ids.fleet, insurer: 'Aseguradora de prueba', policyNumber: 'MCP-TEST-001', startDate: '2026-01-01', expiryDate: '2027-12-31', coverageType: 'basic', premium: 1000 });
    await approve(proposal);
    const created = await commit('fleet', proposal);
    const update = await prepare('fleet', 'fleet.insurance.update', { policyId: created.result.id, premium: 1100 });
    await approve(update);
    await commit('fleet', update);
    const detail = await run('fleet', 'query', { request: { operation: 'fleet_vehicle_detail', input: { vehicleId: ids.fleet } } });
    assert.equal(detail.result.seguroActivo.polizaId, created.result.id);
  });
  await t.test('Calendario: participantes explícitos con confirmación, permisos e idempotencia', async () => {
    const [{ id: recipientAuth }] = await prisma.$queryRaw`SELECT uuidv7() AS id`;
    const recipient = await prisma.userProfile.create({ data: { authUserId: recipientAuth, displayName: 'Participante MCP', email: 'participant-mcp@example.test' } });
    await prisma.membership.create({ data: { companyId: company.id, userId: recipient.id, roleId: role.id } });
    await assert.rejects(() => prepare('calendar', 'calendar.event.attendees.add', { eventId: ids.calendar, userProfileIds: [other.id] }), { status: 404 });
    const proposal = await prepare('calendar', 'calendar.event.attendees.add', { eventId: ids.calendar, userProfileIds: [recipient.id] });
    assert.equal((await request(`/mcp/proposals/${proposal.proposalId}`, { approve: true }, webToken())).status, 403);
    await approve(proposal);
    const result = await commit('calendar', proposal);
    assert.deepEqual(await commit('calendar', proposal), result);
    assert.equal(await prisma.calendarEventAttendee.count({ where: { eventId: ids.calendar, userId: recipient.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { companyId: company.id, userId: recipient.id, sourceId: ids.calendar, eventType: 'calendar.event.invite' } }), 1);
    await assert.rejects(() => prepare('calendar', 'calendar.event.attendees.add', { eventId: ids.calendar, userProfileIds: [recipient.id] }), { code: 'duplicate_resource' });
    const calendar = await prisma.calendarEvent.findUnique({ where: { id: ids.calendar }, select: { calendarId: true } });
    await prisma.calendarCalendar.update({ where: { id: calendar.calendarId }, data: { ownerId: recipient.id } });
    await prisma.calendarShare.create({ data: { calendarId: calendar.calendarId, userId: user.id, role: 'EDITOR' } });
    await assert.rejects(() => prepare('calendar', 'calendar.event.attendees.add', { eventId: ids.calendar, userProfileIds: [user.id] }), { code: 'permission_denied' });
    await prisma.calendarShare.deleteMany({ where: { calendarId: calendar.calendarId, userId: user.id } });
    await prisma.calendarCalendar.update({ where: { id: calendar.calendarId }, data: { ownerId: user.id } });
  });
  await t.test('Ledger: no se puede asociar una categoría de otra empresa', async () => {
    const category = await prisma.ledgerCategory.create({ data: { companyId: other.id, name: 'Categoría ajena', kind: 'both' } });
    await assert.rejects(() => prepare('ledger', 'ledger.transaction.create', { accountId: account.id, fecha: '2026-10-16', nombre: 'No permitido', retiro: 10, categoryId: category.id }), { code: 'invalid_relation' });
  });
  await t.test('Notas: los cambios de metadatos conservan el estado Yjs concurrente', async () => {
    const proposal = await prepare('notes', 'notes.note.rename_move', { noteId: ids.notes, title: 'Acuerdos confirmados' });
    await approve(proposal);
    const document = new Y.Doc();
    document.getText('fixture').insert(0, 'Contenido concurrente de otra sesión');
    const state = Buffer.from(Y.encodeStateAsUpdate(document));
    await prisma.$executeRaw`INSERT INTO note_ydoc_state (note_id, state, version) VALUES (${ids.notes}::uuid, ${state}::bytea, 2)`;
    await commit('notes', proposal);
    const [stored] = await prisma.$queryRaw`SELECT state FROM note_ydoc_state WHERE note_id = ${ids.notes}::uuid`;
    assert.deepEqual(Buffer.from(stored.state), state);
    document.destroy();
  });
  await t.test('Los grants individuales se respetan y su revocación tiene efecto inmediato', async () => {
    const permission = await prisma.permission.findUnique({ where: { key: 'hr.employee.read' } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    const grant = await prisma.userPermissionGrant.create({ data: { companyId: company.id, userId: user.id, permissionId: permission.id } });
    await run('hr', 'query', { request: { operation: 'hr_employees_search', input: {} } });
    await prisma.userPermissionGrant.delete({ where: { id: grant.id } });
    await assert.rejects(() => run('hr', 'query', { request: { operation: 'hr_employees_search', input: {} } }), { code: 'permission_denied' });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  });
  await t.test('Proyectos: tarea real, asignación, cambio de estado y dependencias', async () => {
    const proposal = await prepare('projects', 'projects.task.create', { project: 'Renovación de cámaras', title: 'Revisar cableado', assignee: user.email });
    await approve(proposal);
    const created = await commit('projects', proposal);
    ids.task = created.result.id;
    const statuses = await prisma.taskStatus.findMany({ where: { projectId: ids.projects }, orderBy: { position: 'asc' } });
    const update = await prepare('projects', 'projects.task.update', { taskId: ids.task, status: statuses[1].name, priority: 'HIGH' });
    await approve(update);
    await commit('projects', update);
    const task = await prisma.task.findUnique({ where: { id: ids.task } });
    assert.equal(task.statusId, statuses[1].id);
    assert.equal(task.assigneeId, user.id);
    assert.equal(task.priority, 'HIGH');
  });
  await t.test('Compras: solicitud aprobada crea un borrador real, sin pago ni recepción', async () => {
    await run('purchases', 'query', { request: { operation: 'purchases_pending', input: {} } });
    const proposal = await prepare('purchases', 'purchases.request.create', { title: 'Renovación de cámaras', estimatedTotal: 5000 });
    await assert.rejects(() => commit('purchases', proposal), { code: 'approval_required' });
    await approve(proposal);
    const result = await commit('purchases', proposal);
    assert.deepEqual(await commit('purchases', proposal), result);
    const row = await prisma.purchaseRequest.findUnique({ where: { id: result.result.id } });
    assert.equal(row.companyId, company.id);
    assert.equal(row.status, 'DRAFT');
    const stale = await prepare('purchases', 'purchases.request.create', { title: 'Otra solicitud' });
    await approve(stale);
    await createPurchasesService({ prisma }).updateSettings(company.id, user.id, { preset: 'CUSTOM', capabilities: { requests: false, approvals: true, purchaseOrders: true, invoices: true, receipts: true, quotes: true } });
    await assert.rejects(() => commit('purchases', stale), { code: 'capability_disabled' });
    const schema = await capabilities.run('runly_module_schema', { companyId: company.id, moduleKey: 'runly.purchases' }, auth);
    assert.equal(schema.operations.some(operation => operation.operation === 'purchases.request.create'), false);
    await createPurchasesService({ prisma }).updateSettings(company.id, user.id, { preset: 'CUSTOM', capabilities: { requests: true, approvals: true, purchaseOrders: true, invoices: true, receipts: true, quotes: true } });
  });
  await t.test('Compras: lote crea orden, factura y proveedor, vincula equipos y reutiliza existentes', async () => {
    for (const key of ['purchases.order.create', 'purchases.invoice.create', 'purchases.relation.manage', 'contacts.contacts.create']) {
      const permission = await prisma.permission.upsert({ where: { key }, create: { key, name: key }, update: {} });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
    }
    await createPurchasesService({ prisma }).updateSettings(company.id, user.id, { preset: 'CUSTOM', capabilities: { requests: true, approvals: true, purchaseOrders: true, invoices: true, receipts: true, quotes: true, inventoryRelations: true } });
    const items = await Promise.all(['321004-60791', '52061803535'].map(serialNumber => prisma.invItem.create({ data: { companyId: company.id, name: `Equipo ${serialNumber}`, serialNumber } })));
    const batch = { documents: [
      { kind: 'invoice', number: 'V265210187', supplier: { name: 'CAME Automatismos de México' }, orderNumber: 'OC 0006174', total: 1160, inventory: [{ serialNumber: '52061803535' }] },
      { kind: 'order', number: 'OC 0006174', supplier: { name: 'CAME Automatismos de México', taxId: 'CAM010101AB1' }, lines: [{ description: 'Barrera GL B1', quantity: 1, unitAmount: 1000, taxRate: 0.16 }], inventory: [{ serialNumber: '321004-60791' }] },
    ] };
    await assert.rejects(() => prepare('purchases', 'purchases.documents.import', { documents: [{ kind: 'order', number: 'OC X', inventory: [{ serialNumber: 'no-existe' }] }] }), { code: 'invalid_proposal' });
    const proposal = await prepare('purchases', 'purchases.documents.import', batch);
    await approve(proposal);
    const { result } = await commit('purchases', proposal);
    assert.deepEqual(result.documents.map(doc => [doc.kind, doc.number, doc.created]), [['order', 'OC 0006174', true], ['invoice', 'V265210187', true]]);
    const [order, invoice] = result.documents;
    const supplier = await prisma.contact.findFirst({ where: { companyId: company.id, taxId: 'CAM010101AB1' } });
    assert.equal((await prisma.purchaseOrder.findUnique({ where: { id: order.id } })).supplierId, supplier.id);
    assert.equal((await prisma.purchaseInvoice.findUnique({ where: { id: invoice.id } })).supplierId, supplier.id, 'Un solo proveedor nuevo por lote');
    const links = await prisma.entityRelation.findMany({ where: { companyId: company.id, targetType: { in: ['inventory_item', 'purchase_order'] }, sourceId: { in: [order.id, invoice.id] } } });
    const has = (sourceId, relationType, targetId) => links.some(row => row.sourceId === sourceId && row.relationType === relationType && row.targetId === targetId);
    assert.ok(has(invoice.id, 'BILLED_FROM', order.id));
    assert.ok(has(order.id, 'PURCHASED_IN', items[0].id));
    assert.ok(has(invoice.id, 'INVOICED_ITEM', items[0].id), 'La factura hereda los equipos de la orden');
    assert.ok(has(invoice.id, 'INVOICED_ITEM', items[1].id));
    const third = await prisma.invItem.create({ data: { companyId: company.id, name: 'Equipo 52061303080', serialNumber: '52061303080' } });
    const again = await prepare('purchases', 'purchases.documents.import', { documents: [{ kind: 'order', number: 'oc 0006174', supplier: { taxId: 'CAM010101AB1' }, inventory: [{ serialNumber: '321004-60791' }, { serialNumber: '52061303080' }] }] });
    await approve(again);
    const reused = (await commit('purchases', again)).result.documents[0];
    assert.equal(reused.id, order.id);
    assert.equal(reused.created, false);
    assert.equal(reused.linkedItems, 1, 'Solo agrega la relación faltante');
    assert.equal(await prisma.entityRelation.count({ where: { companyId: company.id, sourceId: order.id, targetId: third.id, relationType: 'PURCHASED_IN' } }), 1);
    await assert.rejects(() => prepare('purchases', 'purchases.documents.import', { documents: [{ kind: 'order', number: 'OC 9999', inventory: [{ serialNumber: '52061303080' }] }] }), { code: 'invalid_proposal' });
    // Later inventory suites count the company's enabled items.
    await prisma.invItem.updateMany({ where: { id: { in: [...items, third].map(item => item.id) } }, data: { enabled: false } });
  });
  await t.test('Canvas: Board y hotspot reales, actualización aprobada sin reemplazar escena', async () => {
    const proposal = await prepare('canvas', 'canvas.board.create', { name: 'Plano de cámaras' });
    await approve(proposal);
    const created = await commit('canvas', proposal);
    ids.board = created.result.id;
    const page = await prisma.canvasPage.findFirst({ where: { boardId: ids.board } });
    const layer = await prisma.canvasLayer.findFirst({ where: { pageId: page.id } });
    const object = await prisma.canvasObject.create({ data: { companyId: company.id, boardId: ids.board, pageId: page.id, layerId: layer.id, type: 'hotspot', transform: { x: 10, y: 10 }, geometry: {}, createdById: user.id, updatedById: user.id } });
    const hotspot = await createCanvasService({ prisma }).createHotspot(company.id, user.id, ids.board, { objectId: object.id, title: 'Cámara de entrada' });
    const update = await prepare('canvas', 'canvas.hotspot.update', { hotspotId: hotspot.id, status: 'RESOLVED', color: '#123456' });
    await approve(update);
    await commit('canvas', update);
    assert.equal((await prisma.canvasHotspot.findUnique({ where: { id: hotspot.id } })).status, 'RESOLVED');
    assert.deepEqual((await prisma.canvasObject.findUnique({ where: { id: object.id } })).transform, object.transform);
  });
  await t.test('Lecturas completas, paginación y metadatos sin firmar URLs de almacenamiento', async t => {
    const course = await prisma.lmsCourse.create({ data: { companyId: company.id, title: 'Curso MCP', createdById: user.id } });
    const section = await prisma.lmsSection.create({ data: { companyId: company.id, courseId: course.id, title: 'Introducción', position: 1 } });
    const quizLesson = await prisma.lmsLesson.create({ data: { companyId: company.id, courseId: course.id, sectionId: section.id, title: 'Examen', kind: 'quiz', position: 1, settings: {} } });
    const site = await prisma.websiteSite.create({ data: { companyId: company.id, name: 'Sitio MCP' } });
    const sitePage = await prisma.websitePage.create({ data: { companyId: company.id, siteId: site.id, title: 'Inicio', slug: 'inicio', routePath: '/' } });
    const product = await prisma.catalogProduct.create({ data: { companyId: company.id, name: 'Producto MCP', slug: 'producto-mcp', price: 100 } });
    const file = await prisma.fileAsset.create({ data: { bucket: 'test-files', objectKey: 'test-fixture', originalName: 'Acuerdos.txt', mimeType: 'text/plain', sizeBytes: 100, moduleKey: 'runly.files', entityType: 'AtlasFile', entityId: company.id, uploadedById: user.id, accessScope: 'RESTRICTED' } });
    const inputs = { hr_employee_detail: { employeeId: ids.hr }, fleet_vehicle_detail: { vehicleId: ids.fleet }, fleet_vehicle_documents: { vehicleId: ids.fleet }, notes_get: { noteId: ids.notes }, pfm_native_movements_page: { walletId: wallet.id },
      pfm_spending_summary: { from: '2026-10-01', to: '2026-10-31', groupBy: 'category' }, ledger_summary: { from: '2026-10-01', to: '2026-10-31', groupBy: 'category' }, ledger_transactions_page: { accountId: account.id },
      projects_detail: { projectId: ids.projects }, projects_task_detail: { taskId: ids.task }, contacts_detail: { contactId: ids.contacts }, canvas_board_summary: { boardId: ids.board },
      calendar_list_events: { from: '2026-10-01', to: '2026-10-31' }, calendar_summary: { from: '2026-10-01', to: '2026-10-31' }, calendar_free_slots: { from: '2026-10-19', to: '2026-10-20' }, calendar_events_page: { start: '2026-10-01T00:00:00Z', end: '2026-10-31T23:59:59Z' },
      files_metadata: { fileId: file.id }, documents_metadata: { fileId: file.id }, files_record_attachments: { target: { type: 'hr.employee', id: ids.hr } }, attendance_person_status: { search: 'Fixture inexistente' }, attendance_overtime: { from: '2026-10-01', to: '2026-10-07' },
      lms_course_detail: { courseId: course.id }, lms_lesson_detail: { lessonId: quizLesson.id }, lms_quiz_questions: { lessonId: quizLesson.id }, lms_enrollments: { courseId: course.id },
      website_page_detail: { pageId: sitePage.id }, catalog_product_detail: { productId: product.id },
    };
    for (const moduleKey of registry.moduleKeys.filter(key => key !== 'runly.chat')) for (const query of registry.create(moduleKey).queries) await t.test(query.name, async () => {
      const result = await run(moduleKey.slice(6), 'query', { request: { operation: query.name, input: inputs[query.name] ?? {} } });
      assert.equal(result.operation, query.name);
      if (moduleKey === 'runly.files' || moduleKey === 'runly.documents') {
        assert.equal(JSON.stringify(result).includes('test-fixture'), false);
        assert.equal(JSON.stringify(result).includes('signedUrl'), false);
      }
    });
    const first = await run('hr', 'query', { request: { operation: 'hr_employees_page', input: { page: 1, limit: 1 } } });
    const second = await run('hr', 'query', { request: { operation: 'hr_employees_page', input: { page: 2, limit: 1 } } });
    assert.equal(first.result.rows.length, 1);
    assert.equal(second.result.rows.length, 0);
  });
  await t.test('Recursos privados y compartidos: Notas, PFM, Ledger, Proyectos, Calendario y Archivos', async () => {
    const [{ id: foreignAuth }] = await prisma.$queryRaw`SELECT uuidv7()::text AS id`;
    const foreign = await prisma.userProfile.create({ data: { authUserId: foreignAuth, displayName: 'Otra persona', email: 'other-mcp@example.test' } });
    await prisma.membership.create({ data: { userId: foreign.id, companyId: company.id, roleId: role.id } });
    const notes = createNotesService({ prisma });
    const note = await notes.createNote({ userId: foreign.id, companyId: company.id, title: 'Nota privada', content: '<p>Privado</p>' });
    await assert.rejects(() => run('notes', 'query', { request: { operation: 'notes_get', input: { noteId: note.id } } }), { status: 404 });
    await prisma.$executeRaw`INSERT INTO note_shares (note_id, shared_with_user_id, shared_by_user_id, permission) VALUES (${note.id}::uuid, ${user.id}::uuid, ${foreign.id}::uuid, 'read')`;
    await run('notes', 'query', { request: { operation: 'notes_get', input: { noteId: note.id } } });
    await assert.rejects(() => prepare('notes', 'notes.note.rename_move', { noteId: note.id, title: 'No permitido' }), { status: 403 });
    const external = await notes.createNote({ userId: foreign.id, companyId: other.id, title: 'Otra empresa privada', content: '' });
    await prisma.$executeRaw`INSERT INTO note_shares (note_id, shared_with_user_id, shared_by_user_id, permission, external_access) VALUES (${external.id}::uuid, ${user.id}::uuid, ${foreign.id}::uuid, 'read', true)`;
    assert.equal(JSON.stringify(await run('notes', 'query', { request: { operation: 'notes_search', input: {} } })).includes(external.id), false);
    await assert.rejects(() => run('notes', 'query', { request: { operation: 'notes_get', input: { noteId: external.id } } }), { status: 404 });
    const sharedWallet = await prisma.pfmWallet.create({ data: { companyId: company.id, ownerId: foreign.id, name: 'Cartera compartida', kind: 'CASH' } });
    await prisma.pfmWalletMember.create({ data: { walletId: sharedWallet.id, userId: user.id, role: 'VIEWER' } });
    await run('pfm', 'query', { request: { operation: 'pfm_native_movements_page', input: { walletId: sharedWallet.id } } });
    await assert.rejects(() => prepare('pfm', 'pfm.movement.create', { wallet: 'Cartera compartida', direction: 'EXPENSE', amount: 10 }), { code: 'invalid_proposal' });
    const privateAccount = await prisma.ledgerAccount.create({ data: { companyId: company.id, ownerId: foreign.id, name: 'Cuenta privada', bank: 'Efectivo' } });
    assert.equal(JSON.stringify(await run('ledger', 'query', { request: { operation: 'ledger_accounts', input: {} } })).includes(privateAccount.id), false);
    await prisma.ledgerAccountMember.create({ data: { accountId: privateAccount.id, userId: user.id, role: 'viewer' } });
    await assert.rejects(() => prepare('ledger', 'ledger.transaction.create', { accountId: privateAccount.id, fecha: '2026-10-16', nombre: 'No permitido', retiro: 10 }), { code: 'invalid_proposal' });
    const privateProject = await createProjectsService({ prisma }).createProject(company.id, foreign.id, { name: 'Proyecto privado' });
    await assert.rejects(() => run('projects', 'query', { request: { operation: 'projects_detail', input: { projectId: privateProject.id } } }), { status: 404 });
    await prisma.projectMember.create({ data: { projectId: privateProject.id, userId: user.id, role: 'VIEWER' } });
    await run('projects', 'query', { request: { operation: 'projects_detail', input: { projectId: privateProject.id } } });
    await assert.rejects(() => prepare('projects', 'projects.task.create', { project: 'Proyecto privado', title: 'No permitido' }), { code: 'invalid_proposal' });
    const calendar = await prisma.calendarCalendar.create({ data: { ownerId: foreign.id, companyId: company.id, name: 'Agenda privada' } });
    const event = await prisma.calendarEvent.create({ data: { calendarId: calendar.id, title: 'Evento privado', startAt: new Date('2026-10-19T10:00:00Z') } });
    await prisma.calendarShare.create({ data: { calendarId: calendar.id, userId: user.id, role: 'VIEWER' } });
    await assert.rejects(() => prepare('calendar', 'calendar.event.update', { eventId: event.id, title: 'No permitido' }), { code: 'permission_denied' });
    const privateFile = await prisma.fileAsset.create({ data: { bucket: 'test-files', objectKey: 'private-fixture', originalName: 'Privado.txt', mimeType: 'text/plain', sizeBytes: 10, moduleKey: 'runly.files', entityType: 'AtlasFile', entityId: company.id, uploadedById: foreign.id, accessScope: 'RESTRICTED' } });
    assert.equal(JSON.stringify(await run('files', 'query', { request: { operation: 'files_search', input: {} } })).includes(privateFile.id), false);
    await assert.rejects(() => run('files', 'query', { request: { operation: 'files_metadata', input: { fileId: privateFile.id } } }), { status: 404 });
  });
  await t.test('Chat real: solo metadatos de conversaciones participadas y empresa consentida', async () => {
    const [own] = await prisma.$queryRaw`INSERT INTO chat_conversations (company_id, title, type) VALUES (${company.id}::uuid, 'Conversación propia', 'group') RETURNING id`;
    await prisma.$executeRaw`INSERT INTO chat_conversation_members (conversation_id, user_id, role) VALUES (${own.id}::uuid, ${user.id}::uuid, 'member')`;
    await prisma.$executeRaw`INSERT INTO chat_conversations (company_id, title, type) VALUES (${company.id}::uuid, 'Privada sin membresía', 'group')`;
    const [external] = await prisma.$queryRaw`INSERT INTO chat_conversations (company_id, title, type) VALUES (${other.id}::uuid, 'Otra empresa sin consentimiento', 'group') RETURNING id`;
    await prisma.$executeRaw`INSERT INTO chat_conversation_members (conversation_id, user_id, role, external_access) VALUES (${external.id}::uuid, ${user.id}::uuid, 'member', true)`;
    await prisma.$executeRaw`INSERT INTO chat_messages (conversation_id, sender_user_id, body) VALUES (${own.id}::uuid, ${user.id}::uuid, 'Contenido que no debe salir por este contrato')`;
    const result = await run('chat', 'query', { request: { operation: 'chat_my_conversations', input: {} } });
    assert.deepEqual(result.result.conversations.map(c => c.id), [own.id]);
    assert.equal(JSON.stringify(result).includes('Contenido que no debe salir'), false);
    assert.equal(JSON.stringify(result).includes(external.id), false);
  });
  await moduleAttachmentTests(t, { prisma, config, auth, company, other, user, role, request, webToken, ids, wallet, account });
  await t.test('sin membresía activa no se conservan accesos de dominio', async () => {
    await prisma.membership.update({ where: { id: membership.id }, data: { enabled: false } });
    await assert.rejects(() => run('hr', 'query', { request: { operation: 'hr_employees_search', input: {} } }), { code: 'membership_revoked' });
    await prisma.membership.update({ where: { id: membership.id }, data: { enabled: true } });
  });
  await t.test('SDK MCP: contratos de salida reales y consultas HTTP de los siete dominios', async () => {
    const sdk = new Client({ name: 'official-domains', version: '1.0.0' });
    await sdk.connect(new StreamableHTTPClientTransport(new URL(config.resource), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
    try {
      for (const item of cases) {
        const result = await sdk.callTool({ name: `runly_${item.domain}_query`, arguments: { companyId: company.id, request: { operation: item.query, input: {} } } });
        assert.equal(Boolean(result.isError), false, JSON.stringify(result));
        assert.equal(result.structuredContent.data.operation, item.query);
      }
    } finally { await sdk.close(); }
  });
}
