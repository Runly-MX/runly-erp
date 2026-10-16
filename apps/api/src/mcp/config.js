export const SCOPES = ['runly:read', 'inventory:read', 'inventory:write'];

export function mcpConfig(env = process.env) {
  if (env.RUNLY_MCP_ENABLED !== 'true') return null;
  const base = new URL(env.RUNLY_MCP_PUBLIC_URL);
  const web = new URL(env.RUNLY_MCP_WEB_URL);
  for (const url of [base, web]) {
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error('MCP requiere HTTPS (HTTP solo en localhost) y URLs sin credenciales.');
    }
  }
  if (base.pathname !== '/mcp' || !['/', '/app', '/app/'].includes(web.pathname)) throw new Error('Configura MCP en /mcp y la URL web en la raíz o /app.');
  return { resource: base.href, issuer: base.origin, web: web.origin, scopes: SCOPES };
}

export class McpError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function insist(condition, code, message, status = 400) {
  if (!condition) throw new McpError(code, message, status);
}
