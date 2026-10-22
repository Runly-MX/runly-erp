// Inventory export: resolves the items (selected ids, or everything matching
// the list filters/search), loads their relations in batches and writes a CSV
// or Excel file with the columns the user chose.
import { PassThrough, Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import { assertCompany, InventoryServiceError } from './inventory-guards.js';
import { buildInventoryWhere, inventoryFiltersSchema } from './inventory-query.js';
import { createInventorySearch } from './inventory-search-service.js';
import { DEFAULT_LISTED_ADMIN_STATUSES } from './inventory-admin-service.js';
import {
  CUSTOM_FIELD_PREFIX, EXPORT_COLUMNS, catalogGroups, customFieldColumns,
} from './inventory-export-columns.js';

const CHUNK = 500;
export const MAX_EXPORT_ROWS = 200000;
// Image links must outlive the download: signed for a week.
const IMAGE_LINK_SECONDS = 7 * 24 * 3600;
const FILTER_KEYS = Object.keys(inventoryFiltersSchema.shape);
const BOM = '﻿';

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet formula injection: a leading = + - @ would execute in Excel.
  const safe = /^[=+@]/.test(text) || (/^-/.test(text) && !/^-?\d+([.,]\d+)?$/.test(text)) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function createInventoryExportService({ prisma, supabaseAdmin = null }) {
  const search = createInventorySearch({ prisma });

  async function columnCatalog(companyId) {
    assertCompany(companyId);
    const fields = await prisma.invCustomField.findMany({ where: { companyId, enabled: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true, label: true } });
    const columns = [...EXPORT_COLUMNS, ...customFieldColumns(fields)];
    return {
      groups: catalogGroups(fields.length > 0),
      columns: columns.map(({ key, label, group, default: isDefault }) => ({ key, label, group, default: isDefault })),
      maxRows: MAX_EXPORT_ROWS,
    };
  }

  async function resolveWhere(companyId, { ids, search: term, filters = {} }, scope, mine) {
    const picked = Object.fromEntries(Object.entries(filters ?? {}).filter(([k, v]) => FILTER_KEYS.includes(k) && v !== '' && v != null && v !== 'all'));
    if (Array.isArray(ids) && ids.length) {
      return { AND: [buildInventoryWhere(companyId, {}, scope, mine), { id: { in: ids.slice(0, MAX_EXPORT_ROWS) } }] };
    }
    const text = String(term ?? '').trim();
    const base = { ...picked, adminStatus: picked.adminStatus ?? (text ? undefined : DEFAULT_LISTED_ADMIN_STATUSES) };
    if (!text) return buildInventoryWhere(companyId, base, scope, mine);
    let searchIds = null;
    try { searchIds = await search.searchItemIds(companyId, text); } catch { /* falls back to the basic contains */ }
    return buildInventoryWhere(companyId, searchIds ? { ...base, searchIds } : { ...base, search: text }, scope, mine);
  }

  async function areaPathResolver(companyId) {
    const areas = await prisma.invArea.findMany({ where: { companyId }, select: { id: true, name: true, parentId: true } });
    const byId = new Map(areas.map((a) => [a.id, a]));
    return (id) => {
      const names = [];
      for (let node = byId.get(id), guard = 0; node && guard < 20; node = byId.get(node.parentId), guard += 1) names.unshift(node.name);
      return names.join(' / ');
    };
  }

  // Batch lookups for one chunk of items (one query each, not per item).
  async function relationLookups(companyId, items, wanted) {
    const ids = items.map((i) => i.id);
    const out = { comments: new Map(), purchases: new Map(), custodies: new Map(), images: new Map(), actFolios: new Map() };
    const tasks = [];
    if (wanted.has('comments')) {
      tasks.push(prisma.$queryRaw(Prisma.sql`SELECT entity_id::text AS id, string_agg(body, ' | ' ORDER BY created_at) AS value FROM entity_comment
        WHERE company_id = ${companyId}::uuid AND entity_type = 'InvItem' AND entity_id::text = ANY(${ids}::text[]) GROUP BY entity_id`)
        .then((rows) => rows.forEach((r) => out.comments.set(r.id, String(r.value).slice(0, 4000)))));
    }
    if (wanted.has('purchaseDocs')) {
      tasks.push(prisma.$queryRaw(Prisma.sql`SELECT r.item_id::text AS id, string_agg(DISTINCT COALESCE(po.number, pi.number), ', ') AS value FROM (
          SELECT target_id AS item_id, source_type, source_id FROM entity_relation
            WHERE company_id = ${companyId}::uuid AND target_type = 'inventory_item' AND source_type IN ('purchase_order', 'purchase_invoice')
          UNION ALL
          SELECT source_id, target_type, target_id FROM entity_relation
            WHERE company_id = ${companyId}::uuid AND source_type = 'inventory_item' AND target_type IN ('purchase_order', 'purchase_invoice')
        ) r
        LEFT JOIN purchase_order po ON r.source_type = 'purchase_order' AND po.id = r.source_id
        LEFT JOIN purchase_invoice pi ON r.source_type = 'purchase_invoice' AND pi.id = r.source_id
        WHERE r.item_id::text = ANY(${ids}::text[]) GROUP BY r.item_id`)
        .then((rows) => rows.forEach((r) => { if (r.value) out.purchases.set(r.id, r.value); })));
    }
    if (wanted.has('lastCustody')) {
      tasks.push(prisma.$queryRaw(Prisma.sql`SELECT DISTINCT ON (ci.item_id) ci.item_id::text AS id, cu.folio AS value
        FROM inv_custody_item ci JOIN inv_custody cu ON cu.id = ci.custody_id
        WHERE cu.company_id = ${companyId}::uuid AND cu.status <> 'CANCELLED' AND ci.item_id::text = ANY(${ids}::text[])
        ORDER BY ci.item_id, cu.date DESC, cu.created_at DESC`)
        .then((rows) => rows.forEach((r) => out.custodies.set(r.id, r.value))));
    }
    const actIds = [...new Set(items.flatMap((i) => i.adminEvents.map((e) => e.actId)).filter(Boolean))];
    if (wanted.has('actFolio') && actIds.length) {
      tasks.push(prisma.invDeregistrationAct.findMany({ where: { id: { in: actIds }, companyId }, select: { id: true, folio: true } })
        .then((rows) => rows.forEach((r) => out.actFolios.set(r.id, r.folio))));
    }
    if (['images', 'coverImage', 'imageCount'].some((k) => wanted.has(k))) tasks.push(signImages(items, out.images));
    await Promise.all(tasks);
    return out;
  }

  // Image links of every item (cover first), signed in one call per bucket.
  async function signImages(items, target) {
    const files = items.flatMap((item) => [...item.files]
      .filter((f) => f.fileAsset?.mimeType?.startsWith('image/'))
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder)
      .map((f) => ({ itemId: item.id, bucket: f.fileAsset.bucket, key: f.fileAsset.objectKey })));
    if (!files.length || !supabaseAdmin?.storage) return;
    const urls = new Map();
    for (const bucket of new Set(files.map((f) => f.bucket))) {
      const keys = [...new Set(files.filter((f) => f.bucket === bucket).map((f) => f.key))];
      const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(keys, IMAGE_LINK_SECONDS);
      for (const row of data ?? []) if (row.signedUrl) urls.set(`${bucket}/${row.path}`, row.signedUrl);
    }
    for (const f of files) {
      const url = urls.get(`${f.bucket}/${f.key}`);
      if (!url) continue;
      if (!target.has(f.itemId)) target.set(f.itemId, []);
      target.get(f.itemId).push(url);
    }
  }

  // Yields rows (arrays of cell values) for the chosen columns, chunk by chunk.
  async function* rows({ companyId, where, columns, areaPath }) {
    const wanted = new Set(columns.map((c) => c.key));
    let cursor = null;
    for (;;) {
      const items = await prisma.invItem.findMany({
        where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
        orderBy: { id: 'asc' }, take: CHUNK,
        include: {
          category: { select: { name: true } }, brand: { select: { name: true } }, location: { select: { name: true } },
          condition: { select: { name: true } }, catalogModel: { select: { name: true } },
          assignedTo: { select: { firstName: true, lastName: true, employeeCode: true, workEmail: true } },
          createdBy: { select: { displayName: true, firstName: true, lastName: true } },
          customValues: { select: { fieldId: true, value: true } },
          files: { select: { isCover: true, sortOrder: true, fileAsset: { select: { bucket: true, objectKey: true, mimeType: true } } } },
          adminEvents: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { displayName: true, firstName: true, lastName: true } } } },
        },
      });
      if (!items.length) return;
      const lookups = await relationLookups(companyId, items, wanted);
      for (const item of items) yield columns.map((col) => col.value({ item, areaPath, ...lookups }));
      cursor = items[items.length - 1].id;
      if (items.length < CHUNK) return;
    }
  }

  // body: { format: 'csv'|'xlsx', columns: [keys], ids?, search?, filters? }
  async function exportItems(companyId, body, scope = null, mine = null) {
    assertCompany(companyId);
    const format = body.format === 'xlsx' ? 'xlsx' : 'csv';
    const fields = await prisma.invCustomField.findMany({ where: { companyId, enabled: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true, label: true } });
    const catalog = [...EXPORT_COLUMNS, ...customFieldColumns(fields)];
    const byKey = new Map(catalog.map((c) => [c.key, c]));
    const chosen = [...new Set(Array.isArray(body.columns) ? body.columns : [])].map((k) => byKey.get(k)).filter(Boolean);
    if (!chosen.length) throw new InventoryServiceError('Elige al menos una columna.', 400);
    const where = await resolveWhere(companyId, body, scope, mine);
    const total = await prisma.invItem.count({ where });
    if (total === 0) throw new InventoryServiceError('No hay activos que exportar con esos filtros.', 404);
    if (total > MAX_EXPORT_ROWS) throw new InventoryServiceError(`Son ${total} activos; el máximo por exportación es ${MAX_EXPORT_ROWS}. Filtra o exporta por carpetas.`, 400);
    const areaPath = chosen.some((c) => c.key === 'area') ? await areaPathResolver(companyId) : () => '';
    const stampName = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });
    const generator = rows({ companyId, where, columns: chosen, areaPath });
    const headers = chosen.map((c) => c.label);

    // Both formats are written while the database is read in chunks, so memory stays flat
    // however many rows are exported. A failure mid-way destroys the stream (truncated download).
    if (format === 'csv') {
      const lines = async function* csvLines() {
        yield `${BOM}${headers.map(csvCell).join(',')}\r\n`;
        for await (const row of generator) {
          yield `${row.map((cell, i) => csvCell(chosen[i].array ? JSON.stringify(cell ?? []) : cell)).join(',')}\r\n`;
        }
      };
      return { stream: Readable.from(lines(), { objectMode: false }), contentType: 'text/csv; charset=utf-8', filename: `inventario-${stampName}.csv`, total };
    }

    const { default: ExcelJS } = await import('exceljs');
    const out = new PassThrough();
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true, useSharedStrings: false });
    const sheet = workbook.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = chosen.map((col) => ({ header: col.label, width: col.array ? 60 : Math.min(40, Math.max(14, col.label.length + 4)) }));
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
    (async () => {
      for await (const row of generator) {
        sheet.addRow(row.map((cell, i) => (chosen[i].array ? JSON.stringify(cell ?? []) : (cell ?? '')))).commit();
      }
      await sheet.commit();
      await workbook.commit();
    })().catch((err) => out.destroy(err));
    return { stream: out, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `inventario-${stampName}.xlsx`, total };
  }

  return { columnCatalog, exportItems, CUSTOM_FIELD_PREFIX };
}
