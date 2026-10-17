import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { mcpConfig, insist } from './config.js';
import { createMcpOAuth } from './oauth.js';
import { createMcpCapabilities } from './capabilities.js';
import { createMcpAccess } from './access.js';
import { digest, nonce } from './state.js';
import { handleMcpRequest } from './server.js';
import { createMcpActivity } from './activity.js';
import { oauthParameters } from './oauth-validation.js';

export function createMcpRouter({ prisma, authMiddleware, supabaseAdmin, signLogo = async () => null, env = process.env, log = message => console.info(message) }) {
  const router = new Hono(), config = mcpConfig(env);
  if (!config) return router;
  const oauth = createMcpOAuth({ prisma, config });
  const activity = createMcpActivity(prisma);
  const capabilities = createMcpCapabilities({ prisma, config, oauth, supabaseAdmin });
  function errorResponse(err, c) {
    const correlationId = c.get('correlationId');
    const status = err instanceof z.ZodError || err instanceof SyntaxError || err.code === 'invalid_grant' && c.req.path === '/mcp/oauth/token' ? 400 : err.status ?? 500;
    log(JSON.stringify({ event: 'mcp.http', correlationId, status, code: err.code ?? 'invalid_request', ...(err.validationIssues ? { validationIssues: err.validationIssues } : {}) }));
    if (status === 401) c.header('WWW-Authenticate', `Bearer resource_metadata="${config.issuer}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`);
    if (status === 403 && err.code === 'insufficient_scope') c.header('WWW-Authenticate', 'Bearer error="insufficient_scope"');
    return c.json({ error: err.code ?? (status < 500 ? 'invalid_request' : 'server_error'), error_description: status < 500 && !(err instanceof z.ZodError) ? err.message : status === 400 ? 'Parámetros inválidos.' : 'No se pudo completar la solicitud.', correlationId }, status);
  }
  router.onError(errorResponse);
  const origins = new Set([config.issuer, config.web, ...(env.RUNLY_MCP_ALLOWED_ORIGINS || '').split(',').filter(Boolean)]);
  const paths = ['/mcp', '/mcp/*', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server'];
  const guard = async (c, next) => {
    if (c.get('mcpGuarded')) return next();
    c.set('mcpGuarded', true);
    const correlationId = nonce().slice(0, 20);
    c.set('correlationId', correlationId);
    c.header('X-Correlation-Id', correlationId);
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    try {
      insist(new URL(c.req.url).host === new URL(config.resource).host, 'invalid_host', 'Host MCP no autorizado.', 403);
      const origin = c.req.header('Origin');
      insist(!origin || origins.has(origin), 'invalid_origin', 'Origen MCP no autorizado.', 403);
      insist(!c.req.query('access_token'), 'invalid_request', 'No envíes tokens en la URL.');
      // Distributed quotas; do not trust user-controlled forwarding headers.
      const bearer = c.req.header('Authorization') ?? '';
      const peer = c.env?.incoming?.socket?.remoteAddress ?? 'direct';
      async function quota(subject, limit) {
        const key = digest(`mcp-rate:${Math.floor(Date.now() / 60000)}:${subject}`);
        const rate = await prisma.mcpState.upsert({ where: { key }, create: { key, kind: 'rate', payload: {}, counter: 1, expiresAt: new Date(Date.now() + 120000) }, update: { counter: { increment: 1 } } });
        if (rate.counter > limit) { c.header('Retry-After', '60'); insist(false, 'rate_limited', 'Demasiadas solicitudes. Intenta en un minuto.', 429); }
        return rate;
      }
      // A changing forged bearer must not bypass the unauthenticated peer cap.
      const rate = await quota(`peer:${peer}`, 600);
      await quota(bearer ? `token:${digest(bearer)}` : `anonymous:${peer}`, bearer ? 120 : 60);
      if (rate.counter === 1) await prisma.mcpState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await next();
    } catch (err) {
      return errorResponse(err, c);
    }
  };
  for (const path of paths) {
    router.use(path, guard, cors({ origin: origin => origins.has(origin) ? origin : undefined, allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'MCP-Protocol-Version', 'Mcp-Session-Id'], exposeHeaders: ['WWW-Authenticate', 'X-Correlation-Id', 'Mcp-Session-Id'] }), bodyLimit({ maxSize: 65536 }));
  }
  const resourceMetadata = c => c.json({ resource: config.resource, authorization_servers: [config.issuer], scopes_supported: config.scopes, bearer_methods_supported: ['header'], resource_name: 'Runly ERP' });
  router.get('/.well-known/oauth-protected-resource', resourceMetadata);
  router.get('/.well-known/oauth-protected-resource/mcp', resourceMetadata);
  router.get('/.well-known/oauth-authorization-server', c => c.json(oauth.metadata));
  router.post('/mcp/oauth/register', async c => {
    insist(c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json', 'invalid_request', 'Usa application/json.');
    return c.json(await oauth.register(await c.req.json()), 201);
  });
  router.get('/mcp/oauth/authorize', async c => c.redirect(await oauth.authorize(oauthParameters(new URL(c.req.url).searchParams))));
  router.get('/mcp/oauth/request/:id', async c => c.json(await oauth.requestInfo(c.req.param('id'))));
  router.post('/mcp/oauth/token', async c => {
    insist(c.req.header('Content-Type')?.startsWith('application/x-www-form-urlencoded'), 'invalid_request', 'Usa application/x-www-form-urlencoded.');
    return c.json(await oauth.token(oauthParameters(new URLSearchParams(await c.req.text()))));
  });
  router.post('/mcp/oauth/revoke', async c => {
    insist(c.req.header('Content-Type')?.startsWith('application/x-www-form-urlencoded'), 'invalid_request', 'Usa application/x-www-form-urlencoded.');
    await oauth.revokeToken(oauthParameters(new URLSearchParams(await c.req.text()))); return c.body(null, 200);
  });
  router.get('/mcp/account', authMiddleware, async c => {
    const actor = await createMcpAccess(prisma).identity(c.get('authUserId'));
    const grants = await prisma.mcpState.findMany({ where: { kind: 'grant', expiresAt: { gt: new Date() }, payload: { path: ['authUserId'], equals: c.get('authUserId') } }, take: 100 });
    const companies = [...new Map(actor.memberships.map(m => [m.companyId, m.company])).values()];
    const branding = await prisma.brandingConfig.findMany({ where: { companyId: { in: companies.map(company => company.id) } }, select: { companyId: true, primaryColor: true, logoFileId: true } });
    const brandingByCompany = new Map(branding.map(row => [row.companyId, row]));
    const branded = await Promise.all(companies.map(async company => { const row = brandingByCompany.get(company.id); return { ...company, primaryColor: row?.primaryColor ?? null, logoUrl: await signLogo(row?.logoFileId).catch(() => null) }; }));
    const recent = await activity.list(c.get('authUserId'));
    const lastByGrant = new Map();
    for (const row of recent) if (row.grantId && !lastByGrant.has(row.grantId)) lastByGrant.set(row.grantId, row.at);
    return c.json({ companies: branded, grants: grants.filter(g => !g.payload.revoked).map(g => ({ id: g.payload.grantId, clientName: g.payload.clientName, companyIds: g.payload.companyIds, scopes: g.payload.scopes, lastActivityAt: lastByGrant.get(g.payload.grantId) ?? null })) });
  });
  router.get('/mcp/account/activity', authMiddleware, async c => c.json({ activity: await activity.list(c.get('authUserId')) }));
  router.post('/mcp/oauth/consent', authMiddleware, async c => c.json(await oauth.consent(c.get('authUserId'), await c.req.json())));
  router.post('/mcp/account/revoke', authMiddleware, async c => {
    const { grantId } = z.object({ grantId: z.string().max(100) }).strict().parse(await c.req.json());
    await oauth.revokeGrant(c.get('authUserId'), grantId); return c.json({ revoked: true });
  });
  router.get('/mcp/proposals/:id', authMiddleware, async c => c.json(await capabilities.proposalInfo(c.get('authUserId'), c.req.param('id'))));
  router.post('/mcp/proposals/:id', authMiddleware, async c => {
    const { approve, acknowledgeSensitive } = z.object({ approve: z.boolean(), acknowledgeSensitive: z.boolean().optional() }).strict().parse(await c.req.json());
    return c.json(await capabilities.approve(c.get('authUserId'), c.req.param('id'), approve, acknowledgeSensitive));
  });
  router.all('/mcp', async c => {
    const header = c.req.header('Authorization') ?? '';
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header)?.[1];
    const auth = await oauth.authenticate(token);
    return handleMcpRequest(c.req.raw, { auth, capabilities, oauth, token, correlationId: c.get('correlationId'), activity });
  });
  return router;
}
