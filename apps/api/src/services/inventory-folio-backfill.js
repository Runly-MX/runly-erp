// inventory-folio-backfill.js — gives a folio to every item of a company that has none.
// 1) the sinabe custom value ("Folio interno (sinabe)") when it is usable and unique,
// 2) a generated folio for the rest, in creation order. Counters are seeded first so
// generated folios continue after the migrated ones. Idempotent; the custom value is
// left untouched as provenance.
import { FOLIO_MAX, createFolioAllocator, normalizeFolio, parseFolio } from './inventory-folio.js';

export const SINABE_FOLIO_FIELD_KEY = 'sinabe_folio_interno';

export async function backfillFolios({ prisma, companyId, apply = false, fieldKey = SINABE_FOLIO_FIELD_KEY }) {
  const folios = createFolioAllocator();
  const pending = await prisma.invItem.findMany({
    where: { companyId, folio: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, enabled: true, categoryId: true, brandId: true, modelId: true, model: true },
  });
  const report = { total: pending.length, fromCustomField: 0, duplicates: 0, tooLong: 0, generated: 0, counterPrefixes: 0 };
  if (!pending.length) return report;

  const existing = await prisma.invItem.findMany({ where: { companyId, folio: { not: null } }, select: { folio: true, enabled: true } });
  const used = new Set(existing.filter((row) => row.enabled).map((row) => row.folio));
  const values = await prisma.invCustomFieldValue.findMany({
    where: { item: { companyId, folio: null }, field: { companyId, fieldKey } },
    select: { itemId: true, value: true },
  });
  const wantedById = new Map(values.map((row) => [row.itemId, normalizeFolio(row.value)]));

  const assigned = new Map(); // itemId -> folio taken from the custom value
  for (const row of pending) {
    const wanted = wantedById.get(row.id);
    if (!wanted) continue;
    if (wanted.length > FOLIO_MAX) { report.tooLong++; continue; }
    if (row.enabled && used.has(wanted)) { report.duplicates++; continue; }
    if (row.enabled) used.add(wanted);
    assigned.set(row.id, wanted);
  }
  report.fromCustomField = assigned.size;

  // Counters first: migrated and already-assigned folios move them past their numbers.
  const prefixes = new Set();
  for (const folio of [...existing.map((row) => row.folio), ...assigned.values()]) {
    const parsed = parseFolio(folio);
    if (parsed) prefixes.add(parsed.prefix);
    if (apply) await folios.observe(prisma, companyId, folio);
  }
  report.counterPrefixes = prefixes.size;

  for (const row of pending) {
    const folio = assigned.get(row.id);
    if (folio) {
      if (apply) await prisma.invItem.update({ where: { id: row.id }, data: { folio } });
      continue;
    }
    report.generated++;
    if (apply) {
      const generated = await folios.forItem(prisma, companyId, row);
      await prisma.invItem.update({ where: { id: row.id }, data: { folio: generated } });
    }
  }
  return report;
}
