import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auth as sdkAuth } from '@modelcontextprotocol/sdk/client/auth.js';
import { createAuthMiddleware } from '../../services/auth-middleware.js';
import { createInventoryRouter } from '../../routes/inventory/index.js';
import { createInventoryService, InventoryServiceError } from '../../services/inventory-service.js';
import { createMcpAccess } from '../access.js';
import { createMcpRouter } from '../router.js';
import { createMcpState, digest, nonce } from '../state.js';
import { mcpConfig } from '../config.js';
import { inspectorMetadata } from './inspector-metadata.js';

const url = process.env.RUNLY_MCP_TEST_DATABASE_URL;
const safe = url && new URL(url);
if (safe && (!['127.0.0.1', 'localhost'].includes(safe.hostname) || safe.pathname !== '/runly_mcp_test')) throw new Error('Las pruebas MCP requieren una base local runly_mcp_test.');

test('MCP integrado: OAuth, SDK oficial y datos reales de Inventario', { skip: !url, timeout: 120000 }, async t => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  t.after(() => prisma.$disconnect());
  // Verify the actual additive migration against a schema provisioned from
  // Prisma in an empty database. No existing installation is modified.
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS mcp_state');
  const migration = await readFile(new URL('../../../../../prisma/migrations/20261016120000_runly_mcp/migration.sql', import.meta.url), 'utf8');
  for (const sql of migration.split(';').filter(s => s.trim())) await prisma.$executeRawUnsafe(sql);
  const [rls] = await prisma.$queryRaw`SELECT relrowsecurity AS enabled FROM pg_class WHERE relname = 'mcp_state'`;
  assert.equal(rls.enabled, true);
  const [publicAccess] = await prisma.$queryRaw`SELECT has_table_privilege('anon','mcp_state','SELECT') AS allowed`;
  assert.equal(publicAccess.allowed, false);
  const company = await prisma.company.create({ data: { name: 'Empresa de prueba A', slug: `mcp-a-${nonce()}` } });
  const other = await prisma.company.create({ data: { name: 'Empresa de prueba B', slug: `mcp-b-${nonce()}` } });
  const [{ id: authUserId }] = await prisma.$queryRaw`SELECT uuidv7()::text AS id`;
  const user = await prisma.userProfile.create({ data: { authUserId, displayName: 'Persona de prueba', email: `mcp-${nonce()}@example.test` } });
  const role = await prisma.role.create({ data: { companyId: company.id, key: 'mcp.tester', name: 'Pruebas MCP' } });
  const permissions = ['inventory.item.read', 'inventory.item.create', 'inventory.item.update', 'inventory.catalog.manage', 'inventory.customfield.manage', 'inventory.access'];
  for (const key of permissions) {
    const permission = await prisma.permission.upsert({ where: { key }, create: { key, name: key }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const membership = await prisma.membership.create({ data: { companyId: company.id, userId: user.id, roleId: role.id } });
  const module = await prisma.runlyModule.create({ data: { key: 'runly.inventory', name: 'Inventario', version: '1.0.0', manifest: { acl: { module: 'inventory.access' } } } });
  const brand = await prisma.invBrand.create({ data: { companyId: company.id, name: 'Dell' } });
  const category = await prisma.invCategory.create({ data: { companyId: company.id, name: 'Laptop' } });
  await prisma.invLocation.create({ data: { companyId: company.id, name: 'Sistemas' } });
  const hidden = await prisma.invItem.create({ data: { companyId: other.id, name: 'Equipo privado', serialNumber: 'PRIVATE-B' } });
  const secret = nonce();
  function webToken() {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: authUserId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
  }
  const authMiddleware = createAuthMiddleware({ supabaseAdmin: { auth: { getUser: async () => ({ error: { status: 401 } }) } }, cacheGet: () => null, cacheSet: () => {}, getJwtSecret: () => secret, warn: () => {} });
  let router;
  const registrations = [], diagnostics = [];
  const http = serve({ fetch: async req => {
    if (new URL(req.url).pathname === '/mcp/oauth/register') registrations.push(await req.clone().json());
    return router.fetch(req);
  }, port: 0, hostname: '127.0.0.1' });
  await once(http, 'listening');
  t.after(() => new Promise(resolve => http.close(resolve)));
  const base = `http://127.0.0.1:${http.address().port}`;
  const env = { RUNLY_MCP_ENABLED: 'true', RUNLY_MCP_PUBLIC_URL: `${base}/mcp`, RUNLY_MCP_WEB_URL: base };
  router = new Hono().route('/', createMcpRouter({ prisma, authMiddleware, env, log: message => diagnostics.push(JSON.parse(message)) }));
  const httpInventory = new Hono();
  httpInventory.use('/inventory/*', authMiddleware);
  const requirePermission = permission => async (c, next) => {
    try {
      const context = await createMcpAccess(prisma).company(c.get('authUserId'), c.req.header('X-Runly-Company-Id'), permission);
      c.set('companyId', context.companyId);
      c.set('userId', context.actorProfileId);
      c.set('userContext', { profile: context.profile, permissionSet: new Set(permissions) });
      await next();
    } catch (error) { return c.json({ error: error.code }, error.status ?? 500); }
  };
  httpInventory.route('/', createInventoryRouter({ prisma, requirePermission, inventoryService: createInventoryService({ prisma }), InventoryServiceError,
    commentsService: {}, CommentsServiceError: Error, filesService: {}, enrichFilesWithSignedUrls: async rows => rows }));
  router.route('/', httpInventory);
  const config = mcpConfig(env), store = createMcpState(prisma);
  const request = (path, body, token, form = false) => fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: form ? new URLSearchParams(body) : JSON.stringify(body) } : {}) });
  let clientId, tokens, grantId;
  async function connect(scopes = 'runly:read inventory:read inventory:write') {
    const registration = await request('/mcp/oauth/register', { ...inspectorMetadata, redirect_uris: ['http://127.0.0.1/callback'] });
    assert.equal(registration.status, 201);
    clientId = (await registration.json()).client_id;
    const verifier = nonce();
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: 'http://127.0.0.1/callback', response_type: 'code', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'test-state', resource: config.resource, scope: scopes, prompt: 'consent', extension: 'ignored' });
    const authorization = await request(`/mcp/oauth/authorize?${query}`);
    assert.equal(authorization.status, 302);
    const requestId = new URL(authorization.headers.get('location')).searchParams.get('request');
    const consent = await request('/mcp/oauth/consent', { requestId, companyIds: [company.id], approve: true }, webToken());
    assert.equal(consent.status, 200, JSON.stringify(await consent.clone().json()));
    const redirect = new URL((await consent.json()).redirect);
    assert.equal(redirect.searchParams.get('state'), 'test-state');
    const args = { grant_type: 'authorization_code', client_id: clientId, code: redirect.searchParams.get('code'), redirect_uri: 'http://127.0.0.1/callback', code_verifier: verifier, resource: config.resource, client_extension: 'ignored' };
    assert.equal((await request('/mcp/oauth/token', { ...args, code_verifier: nonce() }, null, true)).status, 400);
    const response = await request('/mcp/oauth/token', args, null, true);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    tokens = await response.json();
    assert.equal((await request('/mcp/oauth/token', args, null, true)).status, 400);
    grantId = (await store.get('access', tokens.access_token)).payload.grantId;
    return tokens;
  }
  let sdk;
  async function sdkConnect(token = tokens.access_token) {
    sdk = new Client({ name: 'runly-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(config.resource), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    await sdk.connect(transport);
    return sdk;
  }
  async function call(name, args = {}, error = false) {
    const result = await sdk.callTool({ name, arguments: args });
    assert.equal(Boolean(result.isError), error, JSON.stringify(result));
    if (!error) return result.structuredContent.data;
    try { return JSON.parse(result.content[0].text); } catch { return { code: 'invalid_request' }; }
  }
  await t.test('descubrimiento, desafío y OAuth PKCE de un solo uso', async () => {
    const denied = await request('/mcp');
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate'), /oauth-protected-resource\/mcp/);
    assert.equal((await request('/.well-known/oauth-protected-resource/mcp')).status, 200);
    assert.equal((await (await request('/.well-known/oauth-authorization-server')).json()).code_challenge_methods_supported[0], 'S256');
    assert.equal((await request('/mcp', null, webToken())).status, 401);
    const origin = await fetch(`${base}/mcp`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(origin.status, 403);
    await connect();
    await sdkConnect();
    const tools = (await sdk.listTools()).tools;
    assert.equal(tools.length, 12);
    assert.ok(tools.every(tool => tool.inputSchema && tool.outputSchema && tool.annotations));
    assert.ok(!tools.some(tool => tool.name.includes('delete')));
    assert.equal((await call('runly_whoami')).id, user.id);
    assert.deepEqual((await call('runly_companies_list')).companies.map(c => c.id), [company.id]);
  });
  await t.test('transporte, entradas estrictas y paginación', async () => {
    assert.equal((await request('/mcp', null, tokens.access_token)).status, 405);
    const malformed = await request('/mcp', { jsonrpc: '2.0', id: 1, method: 23 }, tokens.access_token);
    assert.equal(malformed.status, 406); // Missing the required MCP Accept header.
    const invalid = await fetch(config.resource, { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{invalid' });
    assert.equal(invalid.status, 400);
    await call('runly_inventory_search', { companyId: company.id, limit: 1000 }, true);
    await call('runly_inventory_get', { companyId: company.id, itemId: hidden.id, extra: true }, true);
    const badVersion = await fetch(config.resource, { method: 'POST', headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '1900-01-01' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
    assert.equal(badVersion.status, 400);
  });
  await t.test('descubrimiento y OAuth completos con el proveedor del SDK oficial', async () => {
    let information, credentials, verifier, authorizationUrl;
    const provider = {
      redirectUrl: 'http://127.0.0.1/sdk-callback',
      clientMetadata: { client_name: 'SDK OAuth', client_uri: 'https://client.example', redirect_uris: ['http://127.0.0.1/sdk-callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'], application_type: 'web' },
      clientInformation: () => information, saveClientInformation: value => { information = value; },
      tokens: () => credentials, saveTokens: value => { credentials = value; },
      codeVerifier: () => verifier, saveCodeVerifier: value => { verifier = value; },
      redirectToAuthorization: value => { authorizationUrl = value; }, state: () => 'sdk-state',
    };
    assert.equal(await sdkAuth(provider, { serverUrl: config.resource, scope: 'runly:read inventory:read' }), 'REDIRECT');
    const response = await fetch(authorizationUrl, { redirect: 'manual' });
    assert.equal(response.status, 302);
    const requestId = new URL(response.headers.get('location')).searchParams.get('request');
    assert.equal((await request('/mcp/oauth/consent', { requestId, companyIds: [other.id], approve: true }, webToken())).status, 403);
    const consent = await request('/mcp/oauth/consent', { requestId, companyIds: [company.id], approve: true }, webToken());
    const redirect = new URL((await consent.json()).redirect);
    assert.equal(redirect.searchParams.get('iss'), base);
    assert.equal(await sdkAuth(provider, { serverUrl: config.resource, authorizationCode: redirect.searchParams.get('code') }), 'AUTHORIZED');
    assert.equal(credentials.refresh_token, undefined);
    const oauthClient = new Client({ name: 'sdk-oauth', version: '1.0.0' });
    await oauthClient.connect(new StreamableHTTPClientTransport(new URL(config.resource), { authProvider: provider }));
    const result = await oauthClient.callTool({ name: 'runly_inventory_search', arguments: { companyId: company.id } });
    assert.equal(result.structuredContent.data.total, 0);
    await oauthClient.close();
  });
  await t.test('errores DCR HTTP: campos internos, respuesta sin valores sensibles', async () => {
    const response = await request('/mcp/oauth/register', { ...inspectorMetadata, application_type: 'secret-marker' });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'invalid_client_metadata');
    assert.equal(JSON.stringify(body).includes('secret-marker'), false);
    const event = diagnostics.find(entry => entry.correlationId === body.correlationId);
    assert.deepEqual(event.validationIssues, [{ field: 'application_type', code: 'invalid_value' }]);
    assert.equal(JSON.stringify(event).includes('secret-marker'), false);
    assert.equal((await request('/mcp/oauth/authorize?client_id=a&client_id=b')).status, 400);
    const duplicate = await fetch(`${base}/mcp/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&client_id=a&client_id=b' });
    assert.equal(duplicate.status, 400);
  });
  await t.test('Inspector 2.11.0 real: DCR, PKCE, consentimiento, tokens, whoami y 12 herramientas', { skip: process.env.RUNLY_MCP_TEST_INSPECTOR !== 'true', timeout: 90000 }, async () => {
    const storage = await mkdtemp(join(tmpdir(), 'runly-inspector-test-'));
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const callback = `http://127.0.0.1:${reservation.address().port}/oauth/callback`;
    await new Promise(resolve => reservation.close(resolve));
    const inspectorEnv = { ...process.env, MCP_STORAGE_DIR: storage, MCP_CATALOG_PATH: join(storage, 'catalog.json'), MCP_CLIENT_CONFIG_PATH: join(storage, 'client.json'), MCP_INSPECTOR_SECRET_STORE: 'file', MCP_AUTO_OPEN_ENABLED: 'false', NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${new URL('./inspector-tty.js', import.meta.url).href}` };
    async function runInspector(method, extra) {
      const child = spawn('pnpm', ['dlx', '@modelcontextprotocol/inspector@2.11.0', '--cli', config.resource, '--transport', 'http', '--callback-url', callback, '--method', method, ...extra], { shell: process.platform === 'win32', windowsHide: true, env: inspectorEnv });
      let output = '', errors = '', navigation;
      const timer = setTimeout(() => child.kill(), 60000);
      const consume = () => {
        const match = `${output}\n${errors}`.match(/Please navigate to: (http[^\s\u001b]+)/);
        if (match && !navigation) navigation = (async () => {
          const response = await fetch(match[1], { redirect: 'manual' });
          assert.equal(response.status, 302);
          const requestId = new URL(response.headers.get('location')).searchParams.get('request');
          const consent = await request('/mcp/oauth/consent', { requestId, companyIds: [company.id], approve: true }, webToken());
          assert.equal(consent.status, 200);
          const redirect = (await consent.json()).redirect;
          assert.equal(new URL(redirect).origin, new URL(callback).origin);
          await fetch(redirect);
        })();
      };
      child.stdout.on('data', chunk => { output += chunk; consume(); });
      child.stderr.on('data', chunk => { errors += chunk; consume(); });
      try {
        const [code] = await once(child, 'close');
        if (navigation) await navigation;
        assert.equal(code, 0, errors);
        return output;
      } finally { clearTimeout(timer); child.kill(); }
    }
    try {
      assert.match(await runInspector('tools/call', ['--tool-name', 'runly_whoami']), new RegExp(user.id));
      const actual = registrations.find(input => input.redirect_uris?.includes(callback));
      assert.ok(actual, 'Inspector debe registrar su propio cliente, sin bearer preinyectado');
      assert.deepEqual(actual, { ...inspectorMetadata, redirect_uris: [callback], scope: config.scopes.join(' ') });
      const output = await runInspector('tools/list', ['--stored-auth-only']);
      const tools = JSON.parse(output).tools;
      assert.equal(tools.length, 12);
    } finally { await rm(storage, { recursive: true, force: true }); }
  });
  await t.test('MCP Inspector CLI: listado e invocación por Streamable HTTP', { skip: process.env.RUNLY_MCP_TEST_INSPECTOR !== 'true' }, async () => {
    async function inspector(method, extra = []) {
      const header = `Authorization: Bearer ${tokens.access_token}`;
      const child = spawn('pnpm', ['dlx', '@modelcontextprotocol/inspector@2.11.0', '--cli', config.resource, '--transport', 'http', '--method', method, '--header', process.platform === 'win32' ? `"${header}"` : header, ...extra], { shell: process.platform === 'win32', windowsHide: true });
      let output = '', errors = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      const [code] = await once(child, 'close');
      assert.equal(code, 0, errors);
      return output;
    }
    assert.match(await inspector('tools/list'), /runly_inventory_search/);
    assert.match(await inspector('tools/call', ['--tool-name', 'runly_companies_list']), /Empresa de prueba A/);
  });
  let itemId;
  await t.test('alta real, aprobación humana y commits concurrentes idempotentes', async () => {
    const prepared = await call('runly_inventory_create_prepare', { companyId: company.id, plan: { actions: [{ kind: 'item', data: { name: 'Laptop Dell Latitude 5440', brandName: 'Dell', categoryName: 'Laptop', locationName: 'Sistemas', model: 'Latitude 5440', serialNumber: 'ABC123' } }] } });
    assert.equal(prepared.status, 'approval_required');
    const commitArgs = { companyId: company.id, proposalId: prepared.proposalId };
    assert.equal((await call('runly_inventory_create_commit', commitArgs, true)).code, 'approval_required');
    assert.equal((await request(`/mcp/proposals/${prepared.proposalId}`, { approve: true }, tokens.access_token)).status, 401);
    assert.equal((await request(`/mcp/proposals/${prepared.proposalId}`, { approve: true }, webToken())).status, 200);
    const [first, second] = await Promise.all([call('runly_inventory_create_commit', commitArgs), call('runly_inventory_create_commit', commitArgs)]);
    assert.deepEqual(first, second);
    itemId = first.results.find(r => r.kind === 'item').id;
    assert.equal(await prisma.invItem.count({ where: { companyId: company.id, serialNumber: 'ABC123' } }), 1);
    const item = await prisma.invItem.findUnique({ where: { id: itemId } });
    assert.equal(item.brandId, brand.id); assert.equal(item.categoryId, category.id);
    assert.ok(item.folio);
    assert.equal(await prisma.auditLog.count({ where: { companyId: company.id, action: 'inventory.mcp.create' } }), 1);
    const response = await fetch(`${base}/inventory/items/${itemId}`, { headers: { Authorization: `Bearer ${webToken()}`, 'X-Runly-Company-Id': company.id } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.serialNumber, 'ABC123');
  });
  await t.test('consultas reales, catálogos, resumen y aislamiento multiempresa', async () => {
    const result = await call('runly_inventory_search', { companyId: company.id, filters: { serialNumber: 'ABC123' }, limit: 1 });
    assert.equal(result.items[0].id, itemId); assert.equal(result.total, 1);
    const unassigned = await call('runly_inventory_search', { companyId: company.id, filters: { brandId: brand.id, categoryId: category.id, unassigned: true } });
    assert.equal(unassigned.total, 1);
    assert.equal((await call('runly_inventory_get', { companyId: company.id, itemId })).item.serialNumber, 'ABC123');
    assert.equal((await call('runly_inventory_catalogs', { companyId: company.id, search: 'Dell' })).brands[0].id, brand.id);
    assert.equal((await call('runly_inventory_summary', { companyId: company.id })).total, 1);
    assert.equal((await call('runly_inventory_search', { companyId: other.id }, true)).code, 'company_not_granted');
    await call('runly_inventory_get', { companyId: company.id, itemId: hidden.id }, true);
    assert.equal((await call('runly_modules_list', { companyId: company.id })).modules.length, 1);
    assert.equal((await call('runly_module_schema', { companyId: company.id, moduleKey: 'runly.inventory' })).operations.length, 8);
  });
  await t.test('edición real, duplicados, propuestas caducadas o modificadas y rollback', async () => {
    await call('runly_inventory_create_prepare', { companyId: company.id, plan: { actions: [{ kind: 'item', data: { name: 'Duplicado', serialNumber: 'ABC123' } }] } }, true);
    const prepareUpdate = () => call('runly_inventory_update_prepare', { companyId: company.id, changes: { itemId, name: 'Laptop actualizada' } });
    const stale = await prepareUpdate();
    await request(`/mcp/proposals/${stale.proposalId}`, { approve: true }, webToken());
    await prisma.invItem.update({ where: { id: itemId }, data: { notes: 'Cambio desde la interfaz' } });
    assert.equal((await call('runly_inventory_update_commit', { companyId: company.id, proposalId: stale.proposalId }, true)).code, 'proposal_stale');
    const prepared = await prepareUpdate();
    await request(`/mcp/proposals/${prepared.proposalId}`, { approve: true }, webToken());
    await call('runly_inventory_update_commit', { companyId: company.id, proposalId: prepared.proposalId });
    assert.equal((await prisma.invItem.findUnique({ where: { id: itemId } })).name, 'Laptop actualizada');
    const response = await fetch(`${base}/inventory/items/${itemId}`, { headers: { Authorization: `Bearer ${webToken()}`, 'X-Runly-Company-Id': company.id } });
    assert.equal((await response.json()).data.name, 'Laptop actualizada');
    const expired = await call('runly_inventory_update_prepare', { companyId: company.id, changes: { itemId, notes: 'Expirado' } });
    await prisma.mcpState.update({ where: { key: digest(expired.proposalId) }, data: { expiresAt: new Date(0) } });
    await call('runly_inventory_update_commit', { companyId: company.id, proposalId: expired.proposalId }, true);
    const broken = await call('runly_inventory_create_prepare', { companyId: company.id, plan: { actions: [{ kind: 'brand', data: { name: 'Debe revertirse' } }, { kind: 'item', data: { name: 'Fallará', serialNumber: 'ROLLBACK' } }] } });
    await request(`/mcp/proposals/${broken.proposalId}`, { approve: true }, webToken());
    await prisma.invItem.create({ data: { companyId: company.id, name: 'Alta concurrente', serialNumber: 'ROLLBACK' } });
    await call('runly_inventory_create_commit', { companyId: company.id, proposalId: broken.proposalId }, true);
    assert.equal(await prisma.invBrand.count({ where: { companyId: company.id, name: 'Debe revertirse' } }), 0);
    const rollback = await call('runly_inventory_create_prepare', { companyId: company.id, plan: { actions: [
      { kind: 'brand', data: { name: 'Revertir transacción' } },
      { kind: 'customField', data: { label: 'Campo obligatorio', fieldKey: 'required_mcp', fieldType: 'text', required: true } },
      { kind: 'item', data: { name: 'Sin campo obligatorio', serialNumber: 'MISSING-FIELD' } },
    ] } });
    await request(`/mcp/proposals/${rollback.proposalId}`, { approve: true }, webToken());
    await call('runly_inventory_create_commit', { companyId: company.id, proposalId: rollback.proposalId }, true);
    assert.equal(await prisma.invBrand.count({ where: { companyId: company.id, name: 'Revertir transacción' } }), 0);
    assert.equal(await prisma.invCustomField.count({ where: { companyId: company.id, fieldKey: 'required_mcp' } }), 0);
  });
  await t.test('RME3 opt-in: solo descubrimiento de entidades autorizadas', async () => {
    const custom = await prisma.runlyModule.create({ data: { key: 'custom.mcp_demo', name: 'Módulo de prueba', version: '1.0.0', manifest: {
      acl: { module: 'inventory.access' }, mcp: { version: 1, entities: [
        { key: 'asset', permission: 'inventory.item.read', fields: { name: { type: 'string', description: 'Nombre' } } },
        { key: 'private', permission: 'ungranted.permission', fields: { value: { type: 'string' } } },
      ] },
    } } });
    await call('runly_module_schema', { companyId: company.id, moduleKey: custom.key }, true);
    await prisma.companyModule.create({ data: { companyId: company.id, moduleId: custom.id, enabled: true } });
    const schema = await call('runly_module_schema', { companyId: company.id, moduleKey: custom.key });
    assert.equal(schema.discoveryOnly, true); assert.equal(schema.entities.length, 1); assert.deepEqual(schema.operations, []);
    await prisma.runlyModule.update({ where: { id: custom.id }, data: { manifest: { acl: { module: 'inventory.access' }, mcp: { version: 1, entities: [], sql: 'SELECT *' } } } });
    await call('runly_module_schema', { companyId: company.id, moduleKey: custom.key }, true);
  });
  await t.test('revocación de permisos, membresía y habilitación del módulo', async () => {
    await prisma.membership.update({ where: { id: membership.id }, data: { enabled: false } });
    await assert.rejects(() => call('runly_inventory_search', { companyId: company.id }), { code: 403 });
    await prisma.membership.update({ where: { id: membership.id }, data: { enabled: true } });
    const permission = await prisma.permission.findUnique({ where: { key: 'inventory.item.update' } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    await call('runly_inventory_update_prepare', { companyId: company.id, changes: { itemId, notes: 'Sin permiso' } }, true);
    await prisma.companyModule.create({ data: { companyId: company.id, moduleId: module.id, enabled: false } });
    assert.equal((await call('runly_inventory_search', { companyId: company.id }, true)).code, 'module_unavailable');
    await prisma.companyModule.update({ where: { companyId_moduleId: { companyId: company.id, moduleId: module.id } }, data: { enabled: true } });
  });
  await t.test('audience, expiración, refresh rotativo, scopes y revocación', async () => {
    await sdk.close();
    const accessRow = await store.get('access', tokens.access_token);
    await store.save(accessRow, { ...accessRow.payload, resource: 'https://other.example/mcp' });
    assert.equal((await request('/mcp', null, tokens.access_token)).status, 401);
    await store.save(accessRow, accessRow.payload);
    await prisma.mcpState.update({ where: { id: accessRow.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await request('/mcp', null, tokens.access_token)).status, 401);
    const refresh = { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId, resource: config.resource };
    const rotated = await request('/mcp/oauth/token', { ...refresh, scope: 'runly:read' }, null, true);
    assert.equal(rotated.status, 200);
    const newer = await rotated.json();
    assert.equal(newer.scope, 'runly:read');
    const narrowed = new Client({ name: 'narrowed-refresh', version: '1.0.0' });
    await narrowed.connect(new StreamableHTTPClientTransport(new URL(config.resource), { requestInit: { headers: { Authorization: `Bearer ${newer.access_token}` } } }));
    assert.equal((await narrowed.callTool({ name: 'runly_whoami', arguments: {} })).isError, undefined);
    assert.equal((await narrowed.callTool({ name: 'runly_inventory_search', arguments: { companyId: company.id } })).isError, true);
    await narrowed.close();
    const escalated = await request('/mcp/oauth/token', { ...refresh, refresh_token: newer.refresh_token, scope: 'inventory:read' }, null, true);
    assert.equal(escalated.status, 400);
    assert.equal((await escalated.json()).error, 'invalid_scope');
    assert.equal((await request('/mcp/oauth/token', refresh, null, true)).status, 400);
    assert.equal((await request('/mcp', null, newer.access_token)).status, 401);
    await connect('runly:read'); await sdkConnect();
    assert.equal((await call('runly_inventory_search', { companyId: company.id }, true)).code, 'insufficient_scope');
    assert.equal((await request('/mcp/account/revoke', { grantId }, webToken())).status, 200);
    assert.equal((await request('/mcp', null, tokens.access_token)).status, 401);
    await sdk.close();
  });
  await t.test('deshabilitado no afecta al resto de la API', async () => {
    const disabled = new Hono().route('/', createMcpRouter({ prisma, authMiddleware, env: {} })).get('/health', c => c.json({ ok: true }));
    assert.equal((await disabled.request('/mcp')).status, 404);
    assert.equal((await disabled.request('/health')).status, 200);
  });
  await t.test('límites distribuidos y rechazo de cuerpos grandes', async () => {
    const oversized = await fetch(config.resource, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(70000) }) });
    assert.equal(oversized.status, 413);
    const key = digest(`mcp-rate:${Math.floor(Date.now() / 60000)}:token:${digest(`Bearer ${tokens.access_token}`)}`);
    await prisma.mcpState.upsert({ where: { key }, create: { key, kind: 'rate', payload: {}, counter: 120, expiresAt: new Date(Date.now() + 60000) }, update: { counter: 120 } });
    const limited = await request('/mcp', null, tokens.access_token);
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  });
});
