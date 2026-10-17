import { z } from 'zod';
import { createHash, timingSafeEqual } from 'node:crypto';
import { SCOPES, insist } from './config.js';
import { createMcpState, nonce, digest } from './state.js';
import { createMcpAccess } from './access.js';
import { parseOAuth, oauthScope } from './oauth-validation.js';

export const GRANT_IDLE_SECONDS = 30 * 86400;
export const GRANT_MAX_SECONDS = 180 * 86400;

const redirectUri =z.string().max(2048).refine(value => !/[\s\x00-\x1f\x7f]/.test(value)).url().refine(value => {
  if (!URL.canParse(value)) return false;
  const u = new URL(value);
  return !/[\s\x00-\x1f\x7f]/.test(value) && !u.hostname.includes('*') && !u.username && !u.password && !u.hash && (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
});
const registration = z.object({ client_name: z.string().trim().min(1).max(120).default('Cliente MCP'), redirect_uris: z.array(redirectUri).min(1).max(10),
  token_endpoint_auth_method: z.literal('none').default('none'), grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).min(1).max(2).refine(types => types.includes('authorization_code') && new Set(types).size === types.length).default(['authorization_code']), response_types: z.array(z.literal('code')).length(1).default(['code']),
  client_uri: redirectUri.optional(), logo_uri: z.union([redirectUri, z.literal('')]).optional(), scope: z.union([z.literal(''), oauthScope.refine(value => value.split(' ').every(s => SCOPES.includes(s)))]).optional(),
  contacts: z.array(z.email().max(255)).max(10).optional(), software_id: z.string().max(255).optional(), software_version: z.string().max(100).optional(),
  tos_uri: redirectUri.optional(), policy_uri: redirectUri.optional(), application_type: z.enum(['native', 'web']).optional(),
}).strict();
const authorization = z.object({ client_id: z.string().max(100), redirect_uri: redirectUri, response_type: z.literal('code'),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal('S256'), state: z.string().max(2048).optional(),
  scope: oauthScope.default('runly:read'), resource: z.string().url().max(2048) }).strict();

export function createMcpOAuth({ prisma, config }) {
  const state = createMcpState(prisma);
  const access = createMcpAccess(prisma);
  const metadata = {
    issuer: config.issuer, authorization_endpoint: `${config.issuer}/mcp/oauth/authorize`, token_endpoint: `${config.issuer}/mcp/oauth/token`,
    registration_endpoint: `${config.issuer}/mcp/oauth/register`, revocation_endpoint: `${config.issuer}/mcp/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'], scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
  };
  // Pass a per-request cache to reuse identity/permission lookups for the rest
  // of that HTTP request; the cached access rides on a non-enumerable property
  // so it never leaks into proposals, logs or wire payloads.
  async function authenticate(token, scope = null, cache = null) {
    const row = token && await state.get('access', token);
    insist(row?.payload.resource === config.resource, 'invalid_token', 'Token MCP inválido o vencido.', 401);
    const grant = await state.get('grant', row.payload.grantId);
    insist(grant && !grant.payload.revoked && grant.payload.resource === config.resource, 'invalid_token', 'La conexión fue revocada o pertenece a otro recurso.', 401);
    const requestAccess = cache ? createMcpAccess(prisma, cache) : access;
    await requestAccess.identity(grant.payload.authUserId);
    const scopes = (row.payload.scopes ?? grant.payload.scopes).filter(s => grant.payload.scopes.includes(s));
    insist(!scope || scopes.includes(scope), 'insufficient_scope', 'El scope solicitado no está autorizado.', 403);
    const auth = { ...grant.payload, scopes, grantId: row.payload.grantId };
    if (cache) Object.defineProperty(auth, 'access', { value: requestAccess, enumerable: false });
    return auth;
  }
  // Sliding lifetime: every refresh moves the connection's expiry to 30 days
  // from now, capped at 180 days after consent. The refresh token never
  // outlives its grant.
  async function renew(db, grant) {
    const expiresAt = new Date(Math.min(Date.now() + GRANT_IDLE_SECONDS * 1000, grant.createdAt.getTime() + GRANT_MAX_SECONDS * 1000));
    await db.mcpState.update({ where: { id: grant.id }, data: { expiresAt } });
    return expiresAt;
  }
  async function issue(db, grantId, clientId, requestedScopes) {
    const store = createMcpState(db);
    const accessToken = nonce(), refreshToken = nonce();
    const grant = await store.get('grant', grantId);
    const scopes = requestedScopes ?? grant.payload.scopes;
    await store.put('access', accessToken, { grantId, clientId, resource: config.resource, scopes }, 900);
    const allowRefresh = (grant.payload.grantTypes ?? ['refresh_token']).includes('refresh_token');
    if (allowRefresh) await store.put('refresh', refreshToken, { grantId, clientId, resource: config.resource, scopes, accessKey: digest(accessToken), used: false }, Math.max(1, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000)));
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 900, ...(allowRefresh ? { refresh_token: refreshToken } : {}), scope: scopes.join(' ') };
  }
  async function register(body) {
    const client = parseOAuth(registration, body, true);
    const id = nonce();
    await state.put('client', id, client, 31536000);
    return { ...client, client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000) };
  }
  async function authorize(query) {
    const input = parseOAuth(authorization, query);
    insist(input.resource === config.resource, 'invalid_target', 'Recurso MCP incorrecto.');
    const scopes = [...new Set(input.scope.split(' ').filter(Boolean))];
    insist(scopes.length && scopes.every(s => SCOPES.includes(s)), 'invalid_scope', 'Scopes desconocidos.');
    const client = await state.get('client', input.client_id);
    insist(client?.payload.redirect_uris.includes(input.redirect_uri), 'invalid_request', 'Cliente o redirect_uri no autorizado.');
    insist(!client.payload.scope || scopes.every(s => client.payload.scope.split(' ').includes(s)), 'invalid_scope', 'Scopes fuera del registro del cliente.');
    const id = nonce();
    await state.put('request', id, { ...input, scopes, grantTypes: client.payload.grant_types, clientName: client.payload.client_name }, 600);
    return `${config.web}/app/mcp?request=${id}`;
  }
  async function requestInfo(id) {
    const row = await state.get('request', id);
    insist(row && !row.payload.used, 'invalid_request', 'Solicitud vencida o utilizada.');
    return { clientName: row.payload.clientName, redirectUri: row.payload.redirect_uri, scopes: row.payload.scopes };
  }
  async function consent(authUserId, body) {
    const input = z.object({ requestId: z.string().max(100), companyIds: z.array(z.uuid()).max(100), approve: z.boolean() }).strict().parse(body);
    insist(!input.approve || input.companyIds.length > 0, 'invalid_request', 'Selecciona al menos una empresa.');
    return prisma.$transaction(async db => {
      const store = createMcpState(db);
      const request = await store.lock('request', input.requestId);
      insist(!request.payload.used, 'invalid_request', 'Solicitud ya utilizada.');
      for (const id of input.companyIds) await createMcpAccess(db).company(authUserId, id);
      await store.save(request, { ...request.payload, used: true });
      const redirect = new URL(request.payload.redirect_uri);
      redirect.searchParams.set('iss', config.issuer);
      if (request.payload.state !== undefined) redirect.searchParams.set('state', request.payload.state);
      if (!input.approve) redirect.searchParams.set('error', 'access_denied');
      else {
        const grantId = nonce(), code = nonce();
        await store.put('grant', grantId, { grantId, authUserId, resource: config.resource, clientId: request.payload.client_id, clientName: request.payload.clientName, companyIds: [...new Set(input.companyIds)], scopes: request.payload.scopes, grantTypes: request.payload.grantTypes, revoked: false }, GRANT_IDLE_SECONDS);
        await store.put('code', code, { ...request.payload, grantId, used: false }, 120);
        redirect.searchParams.set('code', code);
      }
      return { redirect: redirect.href };
    });
  }
  async function token(body) {
    insist(body?.grant_type, 'invalid_request', 'Missing grant_type.');
    insist(['authorization_code', 'refresh_token'].includes(body?.grant_type), 'unsupported_grant_type', 'Unsupported grant type.');
    const args = parseOAuth(z.object({ grant_type: z.enum(['authorization_code', 'refresh_token']), client_id: z.string().min(1).max(100), resource: z.string().url().max(2048),
      code: z.string().max(100).optional(), redirect_uri: redirectUri.optional(), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).optional(), refresh_token: z.string().max(100).optional(), scope: oauthScope.optional() }).strict(), body);
    insist(args.resource === config.resource, 'invalid_target', 'Recurso MCP incorrecto.');
    const result = await prisma.$transaction(async db => {
      const store = createMcpState(db);
      if (args.grant_type === 'authorization_code') {
        insist(args.code && args.code_verifier, 'invalid_grant', 'Falta el código o PKCE.');
        const row = await store.lock('code', args.code);
        const expected = row.payload;
        const challenge = createHash('sha256').update(args.code_verifier).digest('base64url');
        insist(!expected.used && expected.resource === config.resource && expected.client_id === args.client_id && expected.redirect_uri === args.redirect_uri && timingSafeEqual(Buffer.from(challenge), Buffer.from(expected.code_challenge)), 'invalid_grant', 'Código o PKCE inválido.');
        const grant = await store.lock('grant', expected.grantId);
        insist(!grant.payload.revoked && grant.payload.resource === config.resource, 'invalid_grant', 'Conexión revocada.');
        await store.save(row, { ...expected, used: true });
        await createMcpAccess(db).identity(grant.payload.authUserId);
        return issue(db, expected.grantId, args.client_id);
      }
      insist(args.refresh_token, 'invalid_grant', 'Falta el refresh token.');
      const row = await store.lock('refresh', args.refresh_token);
      insist(row.payload.clientId === args.client_id && row.payload.resource === config.resource, 'invalid_grant', 'Cliente o recurso incorrecto.');
      const grant = await store.lock('grant', row.payload.grantId);
      if (row.payload.used) {
        await store.save(grant, { ...grant.payload, revoked: true });
        return { replay: true };
      }
      insist(!grant.payload.revoked && grant.payload.resource === config.resource, 'invalid_grant', 'Conexión revocada.');
      const previousScopes = row.payload.scopes ?? grant.payload.scopes;
      const scopes = args.scope ? [...new Set(args.scope.split(' '))] : previousScopes;
      insist(scopes.every(s => previousScopes.includes(s) && grant.payload.scopes.includes(s)), 'invalid_scope', 'Scopes fuera de la autorización original.');
      await createMcpAccess(db).identity(grant.payload.authUserId);
      await store.save(row, { ...row.payload, used: true });
      await db.mcpState.deleteMany({ where: { kind: 'access', key: row.payload.accessKey } });
      await renew(db, grant);
      return issue(db, row.payload.grantId, args.client_id, scopes);
    });
    insist(!result.replay, 'invalid_grant', 'Refresh token reutilizado; conexión revocada.');
    return result;
  }
  async function revokeToken(body) {
    const args = parseOAuth(z.object({ token: z.string().max(200), client_id: z.string().max(100), token_type_hint: z.string().max(100).optional() }).strict(), body);
    const row = await state.get('access', args.token) || await state.get('refresh', args.token);
    if (row?.payload.clientId === args.client_id) await revokeGrant(null, row.payload.grantId);
  }
  async function revokeGrant(authUserId, id) {
    await prisma.$transaction(async db => {
      const store = createMcpState(db), row = await store.lock('grant', id);
      insist(!authUserId || authUserId === row.payload.authUserId, 'permission_denied', 'Conexión no disponible.', 403);
      await store.save(row, { ...row.payload, revoked: true });
    });
  }
  return { metadata, authenticate, register, authorize, requestInfo, consent, token, revokeToken, revokeGrant };
}
