// inventory-label-service.js — label templates, printers, rendering and the
// print log (source of truth for "labeled", "last printed" and reprints).
// Every query is scoped by companyId; the layout/rendering itself is the pure
// package in ./inventory-labels/.
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import {
  DEFAULT_TEMPLATES, FORMATS, TRANSPORTS, clampQuantity, createPlaceholderQrUrl, normalizeLayout, renderLabels,
} from './inventory-labels/index.js';

const fail = (message, status = 400) => new InventoryServiceError(message, status);
const text = (value, label, max, required = true) => {
  const out = String(value ?? '').trim();
  if (required && !out) throw fail(`${label} es requerido.`);
  if (out.length > max) throw fail(`${label} es demasiado largo.`);
  return out || null;
};

function templateData(input, existing = null) {
  const merged = { ...(existing ?? {}), ...input };
  const layout = normalizeLayout(merged);
  return {
    name: text(merged.name, 'El nombre', 120),
    widthMm: layout.widthMm,
    heightMm: layout.heightMm,
    dpi: layout.dpi,
    layout: layout.layout,
    fields: layout.fields,
    qrOptions: layout.qrOptions,
    textOptions: layout.textOptions,
    logoFileId: merged.logoFileId || null,
  };
}

function printerData(input, existing = null) {
  const merged = { ...(existing ?? {}), ...input };
  const format = merged.format ?? 'pdf';
  const transport = merged.transport ?? 'browser';
  if (!FORMATS.includes(format)) throw fail('Formato de impresora no válido.');
  if (!TRANSPORTS.includes(transport)) throw fail('Transporte de impresora no válido.');
  const dpi = Math.round(Number(merged.dpi ?? 203));
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 1200) throw fail('La resolución debe estar entre 72 y 1200.');
  const media = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
  const mediaWidthMm = media(merged.mediaWidthMm);
  const mediaHeightMm = media(merged.mediaHeightMm);
  for (const value of [mediaWidthMm, mediaHeightMm]) if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 500)) throw fail('Medidas del medio no válidas.');
  return {
    name: text(merged.name, 'El nombre', 120),
    format,
    dpi,
    transport,
    address: text(merged.address, 'La dirección', 255, false),
    defaultTemplateId: merged.defaultTemplateId || null,
    mediaWidthMm,
    mediaHeightMm,
  };
}

// Public app origin from the environment ('' when none is configured).
export function appBaseUrlFromEnv(env = process.env) {
  for (const candidate of [env.RUNLY_APP_URL, env.APP_URL, env.PUBLIC_APP_URL, env.WEB_APP_URL]) {
    try {
      if (candidate) return new URL(candidate).origin;
    } catch { /* next candidate */ }
  }
  return '';
}

// `publicService` (inventory-public-service) issues the opaque per-item token
// encoded in the QR; without it the Phase 2 placeholder URL is used (tests only).
export function createInventoryLabelService({ prisma, publicBaseUrl = '', resolveItemQrUrl = null, publicService = null } = {}) {
  const qrUrlFor = (requestBaseUrl) => resolveItemQrUrl ?? createPlaceholderQrUrl(publicBaseUrl || requestBaseUrl || '');

  async function tokenResolver(companyId, items, layout, requestBaseUrl) {
    const needsUrl = layout.layout !== 'text-only' && layout.qrOptions?.contentMode !== 'embedded';
    if (!publicService || resolveItemQrUrl || !needsUrl) return qrUrlFor(requestBaseUrl);
    const base = publicBaseUrl || requestBaseUrl || '';
    const tokens = await publicService.ensureTokens(companyId, items.map((item) => item.id));
    return (item) => publicService.urlFor(base, tokens.get(item.id));
  }

  async function ensureDefaultTemplates(companyId) {
    if (await prisma.invLabelTemplate.count({ where: { companyId } })) return;
    await prisma.invLabelTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({ companyId, ...templateData(t), isDefault: t.isDefault })),
    });
  }

  async function assertTemplate(companyId, id) {
    if (!id) return null;
    const row = await prisma.invLabelTemplate.findFirst({ where: { id, companyId, enabled: true } });
    if (!row) throw fail('La plantilla no existe en la empresa actual.', 404);
    return row;
  }

  async function makeDefault(model, companyId, id) {
    await prisma.$transaction([
      prisma[model].updateMany({ where: { companyId, isDefault: true, NOT: { id } }, data: { isDefault: false } }),
      prisma[model].update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  // ── Templates ───────────────────────────────────────────────────────────
  async function listTemplates(companyId) {
    assertCompany(companyId);
    await ensureDefaultTemplates(companyId);
    return prisma.invLabelTemplate.findMany({ where: { companyId, enabled: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async function createTemplate(companyId, input, userId = null) {
    assertCompany(companyId);
    await ensureDefaultTemplates(companyId);
    const row = await prisma.invLabelTemplate.create({ data: { companyId, createdById: userId, ...templateData(input) } });
    if (input.isDefault) await makeDefault('invLabelTemplate', companyId, row.id);
    return prisma.invLabelTemplate.findUnique({ where: { id: row.id } });
  }

  async function updateTemplate(companyId, id, input) {
    assertCompany(companyId);
    const existing = await assertTemplate(companyId, id);
    await prisma.invLabelTemplate.update({ where: { id }, data: templateData(input, existing) });
    if (input.isDefault) await makeDefault('invLabelTemplate', companyId, id);
    return prisma.invLabelTemplate.findUnique({ where: { id } });
  }

  async function removeTemplate(companyId, id) {
    assertCompany(companyId);
    const existing = await assertTemplate(companyId, id);
    await prisma.invLabelTemplate.update({ where: { id }, data: { enabled: false, isDefault: false } });
    if (existing.isDefault) {
      const next = await prisma.invLabelTemplate.findFirst({ where: { companyId, enabled: true }, orderBy: { createdAt: 'asc' } });
      if (next) await makeDefault('invLabelTemplate', companyId, next.id);
    }
  }

  // ── Printers ────────────────────────────────────────────────────────────
  async function listPrinters(companyId) {
    assertCompany(companyId);
    return prisma.invLabelPrinter.findMany({ where: { companyId, enabled: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async function assertPrinter(companyId, id) {
    if (!id) return null;
    const row = await prisma.invLabelPrinter.findFirst({ where: { id, companyId, enabled: true } });
    if (!row) throw fail('La impresora no existe en la empresa actual.', 404);
    return row;
  }

  async function createPrinter(companyId, input) {
    assertCompany(companyId);
    const data = printerData(input);
    await assertTemplate(companyId, data.defaultTemplateId);
    const row = await prisma.invLabelPrinter.create({ data: { companyId, ...data } });
    if (input.isDefault) await makeDefault('invLabelPrinter', companyId, row.id);
    return prisma.invLabelPrinter.findUnique({ where: { id: row.id } });
  }

  async function updatePrinter(companyId, id, input) {
    assertCompany(companyId);
    const existing = await assertPrinter(companyId, id);
    const data = printerData(input, existing);
    await assertTemplate(companyId, data.defaultTemplateId);
    await prisma.invLabelPrinter.update({ where: { id }, data });
    if (input.isDefault) await makeDefault('invLabelPrinter', companyId, id);
    return prisma.invLabelPrinter.findUnique({ where: { id } });
  }

  async function removePrinter(companyId, id) {
    assertCompany(companyId);
    await assertPrinter(companyId, id);
    await prisma.invLabelPrinter.update({ where: { id }, data: { enabled: false, isDefault: false } });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  async function loadItems(companyId, rows) {
    const ids = [...new Set(rows.map((row) => row?.itemId).filter(Boolean))];
    if (!ids.length) throw fail('Selecciona al menos un equipo.');
    const items = await prisma.invItem.findMany({
      where: { companyId, enabled: true, id: { in: ids } },
      select: {
        id: true, folio: true, name: true, serialNumber: true, model: true, assetTag: true,
        location: { select: { name: true } }, brand: { select: { name: true } }, category: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    return items.map(({ location, brand, category, assignedTo, ...item }) => ({
      ...item,
      locationName: location?.name ?? '',
      brandName: brand?.name ?? '',
      categoryName: category?.name ?? '',
      assigneeName: [assignedTo?.firstName, assignedTo?.lastName].filter(Boolean).join(' '),
    }));
  }

  // body: { items: [{ itemId, quantity }], templateId?, layout? (unsaved overrides), printerId?, format?,
  //         sheet? ({ columns, rows, gapMm, marginMm, guides }: letter grid, PDF only) }
  async function render(companyId, body = {}, { baseUrl = '' } = {}) {
    assertCompany(companyId);
    const rows = Array.isArray(body.items) ? body.items : [];
    let template = null;
    if (body.templateId) template = await assertTemplate(companyId, body.templateId);
    else {
      await ensureDefaultTemplates(companyId);
      template = await prisma.invLabelTemplate.findFirst({ where: { companyId, enabled: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    }
    const printer = await assertPrinter(companyId, body.printerId);
    const layout = normalizeLayout({ ...template, ...(body.layout ?? {}), dpi: body.layout?.dpi ?? printer?.dpi ?? template.dpi });
    const format = body.format ?? printer?.format ?? 'pdf';
    const [items, company] = await Promise.all([
      loadItems(companyId, rows),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    ]);
    return renderLabels({ layout, format, rows, items, companyName: company?.name ?? '', resolveItemQrUrl: await tokenResolver(companyId, items, layout, baseUrl), sheet: format === 'pdf' ? body.sheet ?? null : null });
  }

  // ── Print log ───────────────────────────────────────────────────────────
  // body: { items: [{ itemId, quantity }], templateId?, printerId? }
  async function registerPrints(companyId, userId, body = {}) {
    assertCompany(companyId);
    const rows = Array.isArray(body.items) ? body.items : [];
    const items = await loadItems(companyId, rows);
    const known = new Set(items.map((item) => item.id));
    const template = await assertTemplate(companyId, body.templateId);
    const printer = await assertPrinter(companyId, body.printerId);
    const data = rows
      .filter((row) => known.has(row.itemId))
      .map((row) => ({
        companyId, itemId: row.itemId, templateId: template?.id ?? null, printerId: printer?.id ?? null,
        quantity: clampQuantity(row.quantity), userId: userId ?? null,
      }));
    if (!data.length) throw fail('Ningún equipo válido para registrar.');
    await prisma.invLabelPrint.createMany({ data });
    return { count: data.length, labels: data.reduce((sum, row) => sum + row.quantity, 0) };
  }

  async function history(companyId, itemId) {
    assertCompany(companyId);
    const rows = await prisma.invLabelPrint.findMany({
      where: { companyId, itemId },
      orderBy: { printedAt: 'desc' },
      take: 100,
      include: {
        template: { select: { name: true } },
        printer: { select: { name: true } },
        user: { select: { id: true, displayName: true } },
      },
    });
    return rows.map(({ template, printer, user, ...row }) => ({
      ...row, templateName: template?.name ?? null, printerName: printer?.name ?? null, userName: user?.displayName ?? null,
    }));
  }

  // Company-wide print log, newest first (Etiquetas > Historial). Rows written by
  // one registerPrints call share printedAt + userId, which the client uses to
  // group them into print runs.
  async function listPrints(companyId, { page = 1, limit = 50 } = {}) {
    assertCompany(companyId);
    const take = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 50));
    const current = Math.max(1, Math.floor(Number(page)) || 1);
    const where = { companyId };
    const [rows, total] = await Promise.all([
      prisma.invLabelPrint.findMany({
        where,
        orderBy: [{ printedAt: 'desc' }, { id: 'desc' }],
        skip: (current - 1) * take,
        take,
        include: {
          item: { select: { id: true, name: true, folio: true, enabled: true } },
          template: { select: { name: true } },
          printer: { select: { name: true } },
          user: { select: { id: true, displayName: true } },
        },
      }),
      prisma.invLabelPrint.count({ where }),
    ]);
    const data = rows.map(({ item, template, printer, user, ...row }) => ({
      id: row.id,
      itemId: row.itemId,
      itemName: item?.name ?? null,
      itemFolio: item?.folio ?? null,
      itemEnabled: item?.enabled !== false,
      quantity: row.quantity,
      printedAt: row.printedAt,
      templateId: row.templateId ?? null,
      templateName: template?.name ?? null,
      printerId: row.printerId ?? null,
      printerName: printer?.name ?? null,
      userId: row.userId ?? null,
      userName: user?.displayName ?? null,
    }));
    return { data, page: current, limit: take, total };
  }

  // Map itemId -> { labelPrintedAt, labelPrintCount (print events) } for a page of items (one query).
  async function statsForItems(companyId, itemIds) {
    const stats = new Map();
    if (!itemIds.length) return stats;
    const groups = await prisma.invLabelPrint.groupBy({
      by: ['itemId'],
      where: { companyId, itemId: { in: itemIds } },
      _max: { printedAt: true },
      _count: { _all: true },
    });
    for (const group of groups) stats.set(group.itemId, { labelPrintedAt: group._max.printedAt, labelPrintCount: group._count._all });
    return stats;
  }

  return {
    listTemplates, createTemplate, updateTemplate, removeTemplate,
    listPrinters, createPrinter, updatePrinter, removePrinter,
    render, registerPrints, history, listPrints, statsForItems,
  };
}
