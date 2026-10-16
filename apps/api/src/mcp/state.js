import { createHash, randomBytes } from 'node:crypto';
import { insist } from './config.js';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const nonce = () => randomBytes(32).toString('base64url');
export const wire = (value) => JSON.parse(JSON.stringify(value));

// Only hashes of bearer tokens/codes are persisted. The core table is not
// exposed through Supabase; all mutation paths use the API's database role.
export function createMcpState(prisma) {
  async function put(kind, key, payload, seconds) {
    return prisma.mcpState.create({ data: { kind, key: digest(key), payload: wire(payload), expiresAt: new Date(Date.now() + seconds * 1000) } });
  }
  async function get(kind, key, { expired = false } = {}) {
    const row = await prisma.mcpState.findUnique({ where: { key: digest(key) } });
    return row?.kind === kind && (expired || row.expiresAt > new Date()) ? row : null;
  }
  async function lock(kind, key) {
    await prisma.$queryRaw`SELECT id FROM mcp_state WHERE key = ${digest(key)} FOR UPDATE`;
    const row = await get(kind, key);
    insist(row, 'invalid_grant', 'La autorización caducó o fue revocada.', 401);
    return row;
  }
  async function save(row, payload) {
    return prisma.mcpState.update({ where: { id: row.id }, data: { payload: wire(payload) } });
  }
  return { put, get, lock, save };
}

// Business services may open nested transactions. On a transaction client,
// share the outer transaction so approval consumption and ERP writes commit
// together. Never retry an arbitrary business write after a partial commit.
export function transactionClient(tx) {
  return new Proxy(tx, { get(target, key) { return key === '$transaction' ? (fn) => fn(tx) : target[key]; } });
}
