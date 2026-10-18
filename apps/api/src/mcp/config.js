export const SCOPES = ['runly:read', 'inventory:read', 'inventory:write', 'files:write', ...['hr', 'fleet', 'notes', 'pfm', 'ledger', 'projects', 'calendar', 'contacts', 'purchases', 'canvas', 'website', 'catalog', 'lms'].flatMap(domain => [`${domain}:read`, `${domain}:write`]), ...['attendance', 'files', 'documents', 'identity', 'activity', 'chat'].map(domain => `${domain}:read`)];

export function mcpConfig(env = process.env, warn = console.warn) {
  if (env.RUNLY_MCP_ENABLED !== 'true') return null;
  const missing = ['RUNLY_MCP_PUBLIC_URL', 'RUNLY_MCP_WEB_URL'].filter(key => !env[key]?.trim());
  if (missing.length) {
    warn(`[runly-mcp] Servicio deshabilitado: faltan ${missing.join(', ')}. Configura las URLs antes de habilitar MCP.`);
    return null;
  }
  try {
    const base = new URL(env.RUNLY_MCP_PUBLIC_URL);
    const web = new URL(env.RUNLY_MCP_WEB_URL);
    for (const url of [base, web]) {
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        throw new Error('MCP requiere HTTPS (HTTP solo en localhost) y URLs sin credenciales.');
      }
    }
    if (base.pathname !== '/mcp' || !['/', '/app', '/app/'].includes(web.pathname)) throw new Error('Configura MCP en /mcp y la URL web en la raíz o /app.');
    return { resource: base.href, issuer: base.origin, web: web.origin, scopes: SCOPES };
  } catch {
    // Do not print URL values: configuration may contain private hostnames or
    // credentials. An optional integration must not prevent ERP startup.
    warn('[runly-mcp] Servicio deshabilitado: revisa RUNLY_MCP_PUBLIC_URL y RUNLY_MCP_WEB_URL. Se requiere HTTPS (HTTP solo en localhost), /mcp y URLs sin credenciales ni parámetros.');
    return null;
  }
}

export class McpError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function insist(condition, code, message, status = 400) {
  if (!condition) throw new McpError(code, message, status);
}
