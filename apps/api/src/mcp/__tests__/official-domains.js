import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { createCapabilityRegistry } from '../registry.js';
import { createMcpCapabilities } from '../capabilities.js';
import { createMcpOAuth } from '../oauth.js';
import { nonce } from '../state.js';
import { SCOPES } from '../config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function notesSchema(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // db push does not reproduce client-side uuid defaults as database defaults.
    // Production's original fleet/ledger migrations define server-generated IDs.
    for (const table of ['fleet_vehicle', 'fleet_driver', 'fleet_insurance_policy', 'ledger_transaction']) await client.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT uuidv7()`);
    for (const table of ['fleet_vehicle', 'fleet_driver', 'fleet_insurance_policy']) await client.query(`ALTER TABLE ${table} ALTER COLUMN updated_at SET DEFAULT now()`);
    for (const folder of ['20260627120000_atlas_notes_tables', '20260627130000_atlas_notes_fixes', '20260910182109_notes_canvas', '20260918120000_notes_paper_style', '20260919090000_notes_paper_effects', '20260919232806_notes_public_collaborators']) {
      await client.query(await readFile(new URL(`../../../../../prisma/migrations/${folder}/migration.sql`, import.meta.url), 'utf8'));
    }
    await client.query('ALTER TABLE note_shares ADD COLUMN external_access boolean NOT NULL DEFAULT false');
    const isolation = await readFile(new URL('../../../../../prisma/migrations/20260919140000_user_resource_isolation/migration.sql', import.meta.url), 'utf8');
    for (const sql of isolation.match(/CREATE FUNCTION public.runly_(?:member_active|note_user_access)\([\s\S]*?\$\$;/g)) await client.query(sql);
  } finally { await client.end(); }
}

export async function officialDomainTests(t, { prisma, url, config, company, other, user, authUserId, role, membership, request, webToken }) {
  await notesSchema(url);
  const registry = createCapabilityRegistry({ prisma });
  const permissions = [...new Set(registry.tools.flatMap(tool => tool.operations.map(op => op.permission)))];
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
  await prisma.pfmWallet.create({ data: { companyId: company.id, ownerId: user.id, name: 'Personal MCP', kind: 'CASH', currency: 'MXN' } });
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
  ];
  const ids = {};
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
