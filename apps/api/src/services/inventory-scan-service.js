// inventory-scan-service.js — "Escanear" kiosk lookups. A scanned code is a
// Runly QR link (`.../app/p/inv/<token>`, resolved through the public token of
// the caller's company) or a folio / asset number / serial typed or read from a
// barcode (exact, trimmed, case-insensitive, enabled items of the company).
import ExcelJS from 'exceljs';
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import { scopeWhere } from './inventory-scope.js';

export const MAX_SCAN_CODES = 50;
export const MAX_CODE_LENGTH = 512;
export const MAX_EXPORT_ROWS = 2000;
const PUBLIC_PATH_RE = /\/app\/p\/inv\/([A-Za-z0-9_-]+)/;
// Checked in this order when one code matches several identifiers.
const IDENTIFIERS = [['folio', 'folio'], ['assetTag', 'assetTag'], ['serialNumber', 'serial']];

export const normalizeScanCode = (code) => String(code ?? '').trim().slice(0, MAX_CODE_LENGTH);

// Token of a Runly item link (absolute URL or path), else null.
export function publicTokenFromCode(code) {
  const match = PUBLIC_PATH_RE.exec(normalizeScanCode(code));
  return match ? match[1] : null;
}

const ITEM_SELECT = {
  id: true, name: true, folio: true, serialNumber: true, assetTag: true, status: true, adminStatus: true,
  location: { select: { id: true, name: true } },
  category: { select: { name: true } },
  brand: { select: { name: true } },
};

export function createInventoryScanService({ prisma, publicService }) {
  async function coverIds(itemIds) {
    const covers = new Map();
    if (!itemIds.length) return covers;
    const files = await prisma.invItemFile.findMany({
      where: { itemId: { in: itemIds }, fileAsset: { enabled: true, mimeType: { startsWith: 'image/' } } },
      select: { itemId: true, fileAssetId: true, isCover: true },
      orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    for (const file of files) if (!covers.has(file.itemId)) covers.set(file.itemId, file.fileAssetId);
    return covers;
  }

  const shape = (item, covers) => ({
    id: item.id,
    name: item.name,
    folio: item.folio ?? null,
    serialNumber: item.serialNumber ?? null,
    assetTag: item.assetTag ?? null,
    status: item.status,
    adminStatus: item.adminStatus,
    locationId: item.location?.id ?? null,
    locationName: item.location?.name ?? null,
    categoryName: item.category?.name ?? null,
    brandName: item.brand?.name ?? null,
    coverImageFileId: covers.get(item.id) ?? null,
  });

  // -> [{ code, item | null, matchedBy: 'link'|'folio'|'assetTag'|'serial'|null }] in input order.
  // scope (optional): a code of an item outside the caller's areas resolves as not found.
  async function resolveCodes(companyId, rawCodes, scope = null) {
    assertCompany(companyId);
    if (!Array.isArray(rawCodes)) throw new InventoryServiceError('Envía la lista de códigos.', 400);
    if (rawCodes.length > MAX_SCAN_CODES) throw new InventoryServiceError(`Máximo ${MAX_SCAN_CODES} códigos por consulta.`, 400);
    const codes = rawCodes.map(normalizeScanCode);

    const tokenItem = new Map();
    const plain = [];
    for (const code of codes) {
      if (!code) continue;
      const token = publicTokenFromCode(code);
      if (token) {
        if (!tokenItem.has(code)) tokenItem.set(code, await publicService.itemIdForToken(companyId, token));
      } else plain.push(code);
    }
    const unique = [...new Set(plain)];
    const linkedIds = [...new Set([...tokenItem.values()].filter(Boolean))];
    const or = [
      ...(linkedIds.length ? [{ id: { in: linkedIds } }] : []),
      ...unique.flatMap((code) => IDENTIFIERS.map(([field]) => ({ [field]: { equals: code, mode: 'insensitive' } }))),
    ];
    const items = or.length
      ? await prisma.invItem.findMany({ where: { companyId, enabled: true, ...(scopeWhere(scope) ? { AND: [scopeWhere(scope)] } : {}), OR: or }, select: ITEM_SELECT, orderBy: { createdAt: 'asc' } })
      : [];
    const covers = await coverIds(items.map((item) => item.id));
    const byId = new Map(items.map((item) => [item.id, item]));
    const lower = (value) => String(value ?? '').toLowerCase();

    return codes.map((code) => {
      if (!code) return { code, item: null, matchedBy: null };
      if (tokenItem.has(code)) {
        const item = byId.get(tokenItem.get(code));
        return { code, item: item ? shape(item, covers) : null, matchedBy: item ? 'link' : null };
      }
      const needle = code.toLowerCase();
      for (const [field, label] of IDENTIFIERS) {
        const item = items.find((row) => row[field] && lower(row[field]) === needle);
        if (item) return { code, item: shape(item, covers), matchedBy: label };
      }
      return { code, item: null, matchedBy: null };
    });
  }

  // Session list -> XLSX buffer. The client sends the exact table it also
  // exports as CSV ({ columns: [string], rows: [[string]] }).
  async function exportXlsx({ columns, rows } = {}) {
    if (!Array.isArray(columns) || !columns.length || columns.length > 30 || !Array.isArray(rows)) {
      throw new InventoryServiceError('Datos de exportación no válidos.', 400);
    }
    if (rows.length > MAX_EXPORT_ROWS) throw new InventoryServiceError(`Máximo ${MAX_EXPORT_ROWS} filas por exportación.`, 400);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Escaneo', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map((header) => ({ header: String(header).slice(0, 60), width: Math.max(12, String(header).length + 4) }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(columns.map((_, index) => (Array.isArray(row) && row[index] != null ? String(row[index]).slice(0, 1000) : '')));
    }
    sheet.columns.forEach((column) => {
      let width = column.width;
      column.eachCell({ includeEmpty: false }, (cell) => { width = Math.max(width, Math.min(50, String(cell.value ?? '').length + 2)); });
      column.width = width;
    });
    return workbook.xlsx.writeBuffer();
  }

  return { resolveCodes, exportXlsx };
}
