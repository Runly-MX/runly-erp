import { BlockList, isIP } from 'node:net';

const SHORTCUTS = {
  loopback: ['127.0.0.0/8', '::1/128'],
  private: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7', '127.0.0.0/8', '::1/128'],
};

export const normalizeIp = value => {
  const ip = String(value ?? '').trim().replace(/^\[|\]$/g, '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  return isIP(ip) ? ip : null;
};

// Parses RUNLY_MCP_TRUSTED_PROXIES: exact IPs, CIDR ranges and the shortcuts
// "loopback"/"private". Invalid entries are reported by name, never trusted.
export function parseTrustedProxies(value = '', warn = console.warn) {
  const list = new BlockList();
  let size = 0;
  for (const raw of String(value).split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)) {
    for (const entry of SHORTCUTS[raw] ?? [raw]) {
      const [address, prefix] = entry.split('/');
      const ip = normalizeIp(address), family = ip && isIP(ip) === 6 ? 'ipv6' : 'ipv4';
      const bits = prefix === undefined ? (family === 'ipv6' ? 128 : 32) : Number(prefix);
      if (!ip || !Number.isInteger(bits) || bits < 0 || bits > (family === 'ipv6' ? 128 : 32)) {
        warn(`[runly-mcp] RUNLY_MCP_TRUSTED_PROXIES: entrada ignorada (${raw}).`);
        continue;
      }
      list.addSubnet(ip, bits, family);
      size++;
    }
  }
  return { size, has: ip => Boolean(ip) && list.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4') };
}

// The socket peer is authoritative. X-Forwarded-For is only read when that peer
// is a trusted proxy, walking right-to-left past trusted hops, so a client can
// prepend fake addresses but never choose the address the quota is keyed on.
export function resolveClientIp(peer, forwardedFor, trusted) {
  const direct = normalizeIp(peer);
  if (!direct || !trusted.size || !trusted.has(direct)) return direct ?? 'direct';
  const hops = String(forwardedFor ?? '').split(',').map(normalizeIp);
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!hops[i]) return direct;
    if (!trusted.has(hops[i])) return hops[i];
  }
  return hops.length && hops[0] ? hops[0] : direct;
}
