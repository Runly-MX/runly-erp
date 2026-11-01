import { createHash } from 'node:crypto';
import { commerceDto, fail, json } from './pos-contracts.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}

export function createPosCommandService({ prisma }) {
  async function lock(tx, key) {
    // SELECT void must not be decoded as an unsupported PostgreSQL type by Prisma.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS locked`;
  }

  async function run({ companyId, actorId, operation, key, input, execute }) {
    if (!companyId || !actorId) fail('FORBIDDEN', 'Empresa e identidad requeridas.', 403);
    if (typeof key !== 'string' || !/^[\x21-\x7e]{16,128}$/.test(key)) fail('IDEMPOTENCY_REQUIRED', 'Falta una clave de intento válida.', 428);
    const requestHash = createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
    // The response is committed with the money; replay is resolved BEFORE version checks.
    return prisma.$transaction(async (tx) => {
      await lock(tx, `command:${companyId}:${operation}:${key}`);
      const existing = await tx.posCommand.findUnique({ where: { companyId_operation_key: { companyId, operation, key } } });
      if (existing) {
        if (existing.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'El intento ya se usó con otros datos.');
        return existing.response;
      }
      const response = commerceDto(await execute(tx));
      await tx.posCommand.create({ data: { companyId, actorId, operation, key, requestHash, response } });
      return response;
    }, { maxWait: 10000, timeout: 20000 });
  }

  async function audit(tx, { companyId, actorId, entityType, entityId, action, before, after, metadata }) {
    await tx.auditLog.create({ data: { companyId, actorId, moduleKey: 'runly.pos', entityType, entityId,
      action, ...(before === undefined ? {} : { before: json(before) }),
      ...(after === undefined ? {} : { after: json(after) }), ...(metadata === undefined ? {} : { metadata: json(metadata) }) } });
  }

  return { run, lock, audit };
}
