// inventory-folio.js — item folios: TYPE-BRAND-MODEL-N (e.g. TEL-CIS-CP7-158).
// The consecutive is per company and per prefix and comes from an atomic
// counter (inv_folio_counter), never from read-then-write.
import { InventoryServiceError } from './inventory-guards.js';

export const FOLIO_MAX = 100;
const MAX_COUNTER = 2_000_000_000;

// "Teléfono" -> "TEL". Accents stripped, letters/digits only, upper case.
export function codeFromName(name, max = 3) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max);
}

// Catalog `code` column value: up to 6 letters/digits, or null.
export function normalizeCode(value) {
  return codeFromName(value, 6) || null;
}

export function normalizeFolio(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return text || null;
}

// parts: { type, brand, model } each { code?, name? } | null
export function folioPrefix({ type, brand, model } = {}) {
  const segments = [type, brand, model]
    .map((part) => (part ? normalizeCode(part.code) || codeFromName(part.name) : ''))
    .filter(Boolean);
  return segments.length ? segments.join('-') : 'INV';
}

export function parseFolio(folio) {
  const match = /^(.+)-(\d{1,10})$/.exec(String(folio ?? ''));
  if (!match) return null;
  const n = Number(match[2]);
  return n >= 1 && n <= MAX_COUNTER ? { prefix: match[1], n } : null;
}

export const formatFolio = (prefix, n) => `${prefix}-${n}`;

export function createFolioAllocator() {
  // Raises the counter of the folio's prefix to at least its number.
  async function observe(db, companyId, folio) {
    const parsed = parseFolio(folio);
    if (!parsed) return;
    await db.$queryRaw`
      INSERT INTO inv_folio_counter (company_id, prefix, last_value)
      VALUES (${companyId}::uuid, ${parsed.prefix}, ${parsed.n}::int)
      ON CONFLICT (company_id, prefix)
      DO UPDATE SET last_value = GREATEST(inv_folio_counter.last_value, EXCLUDED.last_value)
      RETURNING last_value`;
  }

  async function next(db, companyId, prefix) {
    const rows = await db.$queryRaw`
      INSERT INTO inv_folio_counter (company_id, prefix, last_value)
      VALUES (${companyId}::uuid, ${prefix}, 1)
      ON CONFLICT (company_id, prefix)
      DO UPDATE SET last_value = inv_folio_counter.last_value + 1
      RETURNING last_value`;
    return Number(rows[0].last_value);
  }

  // Catalog rows of an item, falling back to its free-text model name.
  async function partsFor(db, companyId, { categoryId, brandId, modelId, model } = {}) {
    const pick = (row) => (row ? { code: row.code, name: row.name } : null);
    const select = { name: true, code: true };
    const [type, brand, catalogModel] = await Promise.all([
      categoryId ? db.invCategory.findFirst({ where: { id: categoryId, companyId }, select }) : null,
      brandId ? db.invBrand.findFirst({ where: { id: brandId, companyId }, select }) : null,
      modelId ? db.invModel.findFirst({ where: { id: modelId, companyId }, select }) : null,
    ]);
    return { type: pick(type), brand: pick(brand), model: pick(catalogModel) ?? (model ? { name: model } : null) };
  }

  async function allocate(db, companyId, parts) {
    const prefix = folioPrefix(parts);
    for (let attempt = 0; attempt < 25; attempt++) {
      const folio = formatFolio(prefix, await next(db, companyId, prefix));
      const taken = await db.invItem.findFirst({ where: { companyId, folio, enabled: true }, select: { id: true } });
      if (!taken) return folio;
    }
    throw new InventoryServiceError('No se pudo asignar un folio disponible.', 409);
  }

  const forItem = async (db, companyId, input) => allocate(db, companyId, await partsFor(db, companyId, input));

  return { observe, allocate, forItem, partsFor };
}
