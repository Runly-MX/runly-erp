// Single source of truth for "who is calling" on unauthenticated endpoints and
// rate limits. The socket peer is authoritative; X-Forwarded-For is honoured only
// through RUNLY_TRUSTED_PROXIES (fallback RUNLY_MCP_TRUSTED_PROXIES), never by
// taking its first value, which any client can forge.
import { parseTrustedProxies, resolveClientIp } from '../mcp/client-ip.js';

let cache = { source: null, trusted: null };

export function trustedProxiesFromEnv(env = process.env) {
  const source = env.RUNLY_TRUSTED_PROXIES || env.RUNLY_MCP_TRUSTED_PROXIES || '';
  if (cache.source !== source || !cache.trusted) cache = { source, trusted: parseTrustedProxies(source) };
  return cache.trusted;
}

// Without a configured proxy (or without a socket) every request keys on the peer
// address: safe by default, never attacker-chosen.
export function clientIp(c, env = process.env) {
  return resolveClientIp(c.env?.incoming?.socket?.remoteAddress, c.req.header('x-forwarded-for'), trustedProxiesFromEnv(env));
}
