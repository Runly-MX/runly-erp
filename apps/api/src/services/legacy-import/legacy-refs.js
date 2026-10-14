// Legacy reference ledger (legacy_ref): legacy identifier -> Runly row id.
// `ensure` makes every import idempotent: an existing reference short-circuits,
// otherwise the row and its reference are written in one transaction, so a
// crash never leaves a created row without its reference.
import { LegacyImportError } from './shared.js';

const MAX_LEGACY_ID = 120;

export function normalizeLegacyKey({ companyId, source, entity, legacyId }) {
  if (!companyId) throw new LegacyImportError('companyId es obligatorio.');
  const src = String(source ?? '').trim();
  const ent = String(entity ?? '').trim();
  const id = legacyId === undefined || legacyId === null ? '' : String(legacyId).trim();
  if (!src || src.length > 40) throw new LegacyImportError('El origen (source) es obligatorio y de máximo 40 caracteres.');
  if (!ent || ent.length > 60) throw new LegacyImportError('La entidad es obligatoria y de máximo 60 caracteres.');
  if (!id) throw new LegacyImportError(`Falta el identificador legado de ${ent}.`);
  if (id.length > MAX_LEGACY_ID) throw new LegacyImportError(`El identificador legado de ${ent} supera ${MAX_LEGACY_ID} caracteres.`);
  return { companyId, source: src, entity: ent, legacyId: id };
}

const isUniqueViolation = (err) => err?.code === 'P2002';

export function createLegacyRefs({ prisma }) {
  const where = (key) => ({ companyId_source_entity_legacyId: key });

  async function find(input, db = prisma) {
    const key = normalizeLegacyKey(input);
    const row = await db.legacyRef.findUnique({ where: where(key) });
    return row ? row.targetId : null;
  }

  // Map legacyId -> targetId for many ids of one entity.
  async function findMany({ companyId, source, entity, legacyIds }) {
    const ids = [...new Set((legacyIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await prisma.legacyRef.findMany({ where: { companyId, source, entity, legacyId: { in: ids } } });
    return new Map(rows.map((row) => [row.legacyId, row.targetId]));
  }

  // Reverse lookup: which legacy ids point to a Runly row.
  async function findByTarget({ companyId, targetId }) {
    return prisma.legacyRef.findMany({ where: { companyId, targetId } });
  }

  async function remember(tx, input, targetId) {
    const key = normalizeLegacyKey(input);
    if (!targetId) throw new LegacyImportError('remember requiere targetId.');
    return tx.legacyRef.create({ data: { ...key, targetId } });
  }

  // createFn(tx, prepared) -> target id (string) or { id, ...extra }.
  // options.prepare(): async work outside the transaction (e.g. a storage
  // upload) whose result is passed to createFn; options.cleanup(prepared)
  // undoes it when the transaction fails or loses a race.
  async function ensure(input, createFn, { prepare = null, cleanup = null, timeout = 60_000 } = {}) {
    const key = normalizeLegacyKey(input);
    const existing = await prisma.legacyRef.findUnique({ where: where(key) });
    if (existing) return { id: existing.targetId, created: false };
    const prepared = prepare ? await prepare() : undefined;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const out = await createFn(tx, prepared);
        const id = typeof out === 'string' ? out : out?.id;
        if (!id) throw new LegacyImportError(`La importación de ${key.entity} no devolvió un id.`);
        await tx.legacyRef.create({ data: { ...key, targetId: id } });
        return typeof out === 'string' ? { id } : out;
      }, { timeout, maxWait: 10_000 });
      return { ...result, created: true };
    } catch (err) {
      if (cleanup && prepared !== undefined) await cleanup(prepared);
      if (isUniqueViolation(err)) {
        const raced = await prisma.legacyRef.findUnique({ where: where(key) });
        if (raced) return { id: raced.targetId, created: false };
      }
      throw err;
    }
  }

  // Same API with companyId + source bound: ensure(entity, legacyId, createFn).
  function bind(companyId, source) {
    return {
      find: (entity, legacyId, db) => find({ companyId, source, entity, legacyId }, db),
      findMany: (entity, legacyIds) => findMany({ companyId, source, entity, legacyIds }),
      remember: (tx, entity, legacyId, targetId) => remember(tx, { companyId, source, entity, legacyId }, targetId),
      ensure: (entity, legacyId, createFn, options) => ensure({ companyId, source, entity, legacyId }, createFn, options),
    };
  }

  // Removes every reference of a source in a company (test cleanup / re-import).
  async function forget({ companyId, source, entity }) {
    const { count } = await prisma.legacyRef.deleteMany({ where: { companyId, source, ...(entity ? { entity } : {}) } });
    return count;
  }

  return { find, findMany, findByTarget, remember, ensure, bind, forget };
}
