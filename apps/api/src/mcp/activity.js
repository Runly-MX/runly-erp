import { nonce } from './state.js';
import { digest } from './state.js';

const RETENTION_SECONDS = 30 * 24 * 3600;

// Activity rows keep only who/what/when/outcome. Tool inputs and results are
// never stored, so the history cannot leak record contents or secrets.
export function createMcpActivity(prisma) {
  async function record(entry) {
    try {
      await prisma.mcpState.create({ data: { kind: 'activity', key: digest(`activity:${nonce()}`), expiresAt: new Date(Date.now() + RETENTION_SECONDS * 1000),
        payload: { type: entry.type, authUserId: entry.authUserId, grantId: entry.grantId ?? null, clientName: entry.clientName ?? null, tool: entry.tool ?? null,
          moduleKey: entry.moduleKey ?? null, mode: entry.mode ?? null, operation: typeof entry.operation === 'string' ? entry.operation.slice(0, 120) : null,
          companyId: entry.companyId ?? null, status: entry.status } } });
    } catch (error) { console.info(JSON.stringify({ event: 'mcp.activity_failed', code: error.code ?? 'unknown' })); }
  }
  async function list(authUserId, take = 200) {
    const rows = await prisma.mcpState.findMany({ where: { kind: 'activity', expiresAt: { gt: new Date() }, payload: { path: ['authUserId'], equals: authUserId } }, orderBy: { createdAt: 'desc' }, take });
    return rows.map(row => ({ id: row.id, at: row.createdAt.toISOString(), ...row.payload, authUserId: undefined }));
  }
  return { record, list };
}
