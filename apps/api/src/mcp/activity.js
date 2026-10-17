export const ACTIVITY_RETENTION_MS = 30 * 24 * 3600 * 1000;

// Activity rows keep only who/what/when/outcome. Tool inputs and results are
// never stored, so the history cannot leak record contents or secrets.
export function createMcpActivity(prisma) {
  async function record(entry) {
    try {
      await prisma.mcpActivity.create({ data: { type: entry.type, authUserId: entry.authUserId, grantId: entry.grantId ?? null, clientName: entry.clientName ?? null, tool: entry.tool ?? null,
        moduleKey: entry.moduleKey ?? null, mode: entry.mode ?? null, operation: typeof entry.operation === 'string' ? entry.operation.slice(0, 120) : null,
        companyId: typeof entry.companyId === 'string' ? entry.companyId.slice(0, 64) : null, status: entry.status } });
    } catch (error) { console.info(JSON.stringify({ event: 'mcp.activity_failed', code: error.code ?? 'unknown' })); }
  }
  async function list(authUserId, take = 200) {
    const rows = await prisma.mcpActivity.findMany({ where: { authUserId, createdAt: { gt: new Date(Date.now() - ACTIVITY_RETENTION_MS) } }, orderBy: { createdAt: 'desc' }, take });
    return rows.map(({ authUserId: _owner, createdAt, ...row }) => ({ ...row, at: createdAt.toISOString() }));
  }
  return { record, list };
}
