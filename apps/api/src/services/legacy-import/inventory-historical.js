// Historical inventory writes for legacy migrations: items in any
// administrative status with their original dates, dated assignments and item
// files with checksum. Bypasses the public rules on purpose (spec
// 2026-10-14-legacy-import-toolkit-design §3); never exposed over HTTP.
import { ADMIN_STATUSES, DEREGISTRATION_REASONS } from '../inventory-admin-service.js';
import { ACQUISITION_ORIGINS } from '../inventory-service.js';
import { assignItemTx } from '../inventory-assignment-tx.js';
import { findActiveDuplicates } from '../inventory-identifiers.js';
import { LegacyImportError, clip, toDateOnly, toTimestamp, writeImportAudit, sha256 } from './shared.js';

const MODULE_KEY = 'runly.inventory';
const MAX_FILES_PER_ITEM = 20;
const OPERATIONAL_STATUSES = new Set(['available', 'maintenance']);

// Validates the status combination of an imported item and returns the
// normalized administrative fields. Throws on inconsistent legacy data so the
// migrator maps it explicitly instead of importing something misleading.
export function normalizeItemStatus(data = {}) {
  const adminStatus = data.adminStatus ?? 'registered';
  if (!ADMIN_STATUSES.includes(adminStatus)) throw new LegacyImportError(`Estado administrativo no válido: ${adminStatus}.`);
  const status = data.status ?? 'available';
  if (status === 'assigned') throw new LegacyImportError('El estado «assigned» se importa con importAssignment, no en el activo.');
  if (!OPERATIONAL_STATUSES.has(status)) throw new LegacyImportError(`Estado operativo no válido: ${status}.`);
  const registeredAt = toDateOnly(data.registeredAt);
  const deregisteredAt = toDateOnly(data.deregisteredAt);
  let reason = data.deregistrationReason ?? null;
  if (adminStatus === 'registration_pending' && registeredAt) throw new LegacyImportError('Un activo pendiente de alta no tiene fecha de alta.');
  if (adminStatus !== 'deregistered' && deregisteredAt) throw new LegacyImportError('Solo un activo dado de baja tiene fecha de baja.');
  if (adminStatus === 'deregistered' && !deregisteredAt) throw new LegacyImportError('Un activo dado de baja requiere la fecha de baja.');
  if (registeredAt && deregisteredAt && deregisteredAt < registeredAt) throw new LegacyImportError('La fecha de baja es anterior a la fecha de alta.');
  if (adminStatus === 'deregistered' || adminStatus === 'deregistration_proposed') {
    reason = reason ?? 'other';
    if (!DEREGISTRATION_REASONS.includes(reason)) throw new LegacyImportError(`Motivo de baja no válido: ${reason}.`);
  } else if (reason) {
    throw new LegacyImportError('Solo una baja (o propuesta de baja) lleva motivo.');
  }
  return {
    adminStatus,
    status: adminStatus === 'deregistered' ? 'available' : status,
    registeredAt,
    deregisteredAt,
    deregistrationReason: reason,
  };
}

// Admin event ledger for an imported item. Explicit events win; otherwise the
// history is reconstructed from the final status with the original dates.
export function buildAdminEvents({ adminStatus, registeredAt, deregisteredAt, deregistrationReason }, { source, events } = {}) {
  const note = `Importado desde ${source}`;
  if (Array.isArray(events) && events.length) {
    return events.map((event) => {
      if (!ADMIN_STATUSES.includes(event.toStatus)) throw new LegacyImportError(`Estado de evento no válido: ${event.toStatus}.`);
      if (event.fromStatus && !ADMIN_STATUSES.includes(event.fromStatus)) throw new LegacyImportError(`Estado de evento no válido: ${event.fromStatus}.`);
      return {
        action: clip(event.action, 40) ?? 'legacy_import',
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus,
        reason: clip(event.reason, 40),
        comment: clip(event.comment, 2000) ?? note,
        effectiveDate: toDateOnly(event.effectiveDate),
      };
    });
  }
  const first = adminStatus === 'registration_pending' ? 'registration_pending' : 'registered';
  const out = [{ action: 'legacy_import', fromStatus: null, toStatus: first, reason: null, comment: note, effectiveDate: registeredAt ?? null }];
  if (adminStatus === 'deregistration_proposed') {
    out.push({ action: 'propose_deregistration', fromStatus: 'registered', toStatus: adminStatus, reason: deregistrationReason, comment: note, effectiveDate: null });
  }
  if (adminStatus === 'deregistered') {
    out.push({ action: 'approve_deregistration', fromStatus: 'registered', toStatus: adminStatus, reason: deregistrationReason, comment: note, effectiveDate: deregisteredAt });
  }
  return out;
}

function itemFields(data) {
  const out = {};
  const text = { name: 255, description: 2000, serialNumber: 255, model: 255, partNumber: 255, vendorName: 255, invoiceNumber: 100, warrantyNotes: 500, licenseKey: 500, notes: 2000, itemType: 50 };
  for (const [key, max] of Object.entries(text)) if (data[key] !== undefined) out[key] = clip(data[key], max);
  for (const key of ['categoryId', 'brandId', 'locationId', 'conditionId', 'modelId']) if (data[key] !== undefined) out[key] = data[key] || null;
  for (const key of ['purchaseDate', 'warrantyExpiry', 'licenseExpiry']) if (data[key] !== undefined) out[key] = toDateOnly(data[key]);
  if (data.purchasePrice !== undefined && data.purchasePrice !== null && data.purchasePrice !== '') {
    const price = Number(data.purchasePrice);
    if (!Number.isFinite(price) || price < 0) throw new LegacyImportError('El precio de compra no es válido.');
    out.purchasePrice = Math.round(price * 100) / 100;
  }
  if (data.licenseSeats !== undefined && data.licenseSeats !== null) out.licenseSeats = Number.parseInt(data.licenseSeats, 10) || null;
  if (data.acquisitionOrigin !== undefined) {
    const origin = String(data.acquisitionOrigin || 'OTHER').toUpperCase();
    if (!ACQUISITION_ORIGINS.includes(origin)) throw new LegacyImportError(`Origen de adquisición no válido: ${origin}.`);
    out.acquisitionOrigin = origin;
  }
  return out;
}

export function createInventoryHistorical({ prisma, refs, fileStore, defaultSource }) {
  async function assertRefs(companyId, data) {
    const checks = [['invCategory', data.categoryId, 'tipo'], ['invBrand', data.brandId, 'marca'], ['invLocation', data.locationId, 'ubicación'],
      ['invCondition', data.conditionId, 'condición'], ['invModel', data.modelId, 'modelo']];
    for (const [model, id, label] of checks) {
      if (!id) continue;
      const row = await prisma[model].findFirst({ where: { id, companyId }, select: { id: true } });
      if (!row) throw new LegacyImportError(`La ${label} indicada no pertenece a la empresa.`);
    }
  }

  // customValues: [{ fieldId | fieldKey, value }]. Keys resolve to the
  // company field of the item's category first, then a global one.
  async function resolveCustomValues(companyId, categoryId, customValues, warnings) {
    if (!Array.isArray(customValues) || !customValues.length) return [];
    const fields = await prisma.invCustomField.findMany({ where: { companyId, enabled: true }, select: { id: true, fieldKey: true, categoryId: true } });
    const byId = new Map(fields.map((field) => [field.id, field]));
    const out = new Map();
    for (const entry of customValues) {
      let field = entry.fieldId ? byId.get(entry.fieldId) : null;
      if (!field && entry.fieldKey) {
        const matches = fields.filter((candidate) => candidate.fieldKey === entry.fieldKey);
        field = matches.find((candidate) => candidate.categoryId && candidate.categoryId === categoryId) ?? matches.find((candidate) => !candidate.categoryId) ?? null;
      }
      if (!field) { warnings.push(`Campo personalizado desconocido: ${entry.fieldKey ?? entry.fieldId}.`); continue; }
      out.set(field.id, entry.value === undefined || entry.value === null ? null : String(entry.value).slice(0, 2000));
    }
    return [...out.entries()].map(([fieldId, value]) => ({ fieldId, value }));
  }

  // Returns { id, created, warnings } or { id: null, created: false, conflict }
  // when an ACTIVE item already uses the serial or asset number (reason
  // 'serial_taken' / 'asset_tag_taken'). The asset number is optional: it is
  // never invented. data.enabled = false imports the item logically deleted,
  // and those never conflict.
  async function importItem({ companyId, actorId = null, source = defaultSource, legacyId, data = {} }) {
    const assetTag = clip(data.assetTag, 100);
    const enabled = data.enabled !== false;
    const statusFields = normalizeItemStatus(data);
    const fields = itemFields(data);
    const previous = await refs.find({ companyId, source, entity: 'inv_item', legacyId });
    if (previous) return { id: previous, created: false, warnings: [] };
    if (enabled) {
      const found = await findActiveDuplicates(prisma, companyId, { assetTag, serialNumber: fields.serialNumber });
      if (found.serialNumber) return { id: null, created: false, conflict: { reason: 'serial_taken', existingId: found.serialNumber.id }, warnings: [] };
      if (found.assetTag) return { id: null, created: false, conflict: { reason: 'asset_tag_taken', assetTag, existingId: found.assetTag.id }, warnings: [] };
    }
    await assertRefs(companyId, fields);
    const warnings = [];
    const customValues = await resolveCustomValues(companyId, fields.categoryId, data.customValues, warnings);
    const events = buildAdminEvents(statusFields, { source, events: data.adminEvents });
    const result = await refs.ensure({ companyId, source, entity: 'inv_item', legacyId }, async (tx) => {
      const item = await tx.invItem.create({
        data: {
          companyId, assetTag, enabled, ...fields, ...statusFields,
          name: fields.name || `Activo ${assetTag ?? fields.serialNumber ?? ''}`.trim(),
          createdById: actorId ?? undefined,
          ...(data.createdAt ? { createdAt: toTimestamp(data.createdAt) } : {}),
        },
      });
      if (customValues.length) await tx.invCustomFieldValue.createMany({ data: customValues.map((value) => ({ ...value, itemId: item.id })) });
      for (const event of events) {
        await tx.invItemAdminEvent.create({
          data: { companyId, itemId: item.id, ...event, actorId, ...(event.effectiveDate ? { createdAt: event.effectiveDate } : {}) },
        });
      }
      await writeImportAudit(tx, {
        companyId, actorId, moduleKey: MODULE_KEY, entityType: 'InvItem', entityId: item.id, action: 'inventory.item.imported',
        after: { assetTag, name: item.name, adminStatus: item.adminStatus }, source, legacyId,
      });
      return item.id;
    });
    return { ...result, warnings };
  }

  // Dated assignment. An open one (no returnedAt) makes the item assigned via
  // assignItemTx; a closed one only writes the history row, so importing
  // assignments in any order never disturbs the current holder.
  async function importAssignment({ companyId, actorId, source = defaultSource, legacyId, itemId, employeeId, assignedAt, returnedAt = null, notes = null }) {
    if (!actorId) throw new LegacyImportError('importAssignment requiere actorId (perfil de la migración).');
    const start = toTimestamp(assignedAt);
    if (!start) throw new LegacyImportError('La asignación requiere la fecha de inicio.');
    const end = toTimestamp(returnedAt);
    if (end && end < start) throw new LegacyImportError('La fecha de devolución es anterior a la de asignación.');
    const key = { companyId, source, entity: 'inv_assignment', legacyId: legacyId ?? `${itemId}:${employeeId}:${start.toISOString()}` };
    const previous = await refs.find(key);
    if (previous) return { id: previous, created: false };
    const [item, employee] = await Promise.all([
      prisma.invItem.findFirst({ where: { id: itemId, companyId, enabled: true }, select: { id: true, adminStatus: true } }),
      prisma.hrEmployee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } }),
    ]);
    if (!item) throw new LegacyImportError('El activo no existe en esta empresa.');
    if (!employee) throw new LegacyImportError('El colaborador no existe en esta empresa.');
    if (!end && item.adminStatus === 'deregistered') throw new LegacyImportError('Un activo dado de baja no puede quedar asignado.');
    if (!end) {
      const active = await prisma.invAssignment.findFirst({ where: { itemId, returnedAt: null }, select: { id: true, employeeId: true } });
      if (active) return { id: null, created: false, conflict: { reason: 'item_already_assigned', assignmentId: active.id, employeeId: active.employeeId } };
    }
    const note = clip(notes, 500) ?? `Importado desde ${source}`;
    return refs.ensure(key, async (tx) => {
      const assignment = end
        ? await tx.invAssignment.create({ data: { itemId, employeeId, assignedById: actorId, assignedAt: start, returnedAt: end, notes: note } })
        : (await assignItemTx(tx, { itemId, employeeId, assignedById: actorId, notes: note, assignedAt: start })).assignment;
      await writeImportAudit(tx, {
        companyId, actorId, moduleKey: MODULE_KEY, entityType: 'InvItem', entityId: itemId, action: 'inventory.item.assignment_imported',
        after: { employeeId, assignedAt: start, returnedAt: end }, source, legacyId: key.legacyId,
      });
      return assignment.id;
    });
  }

  // Stores a file and links it to the item. legacyId defaults to the content
  // checksum, so the same bytes are never attached twice to one item.
  // Returns { id (FileAsset), linkId, created, checksum } or { overflow: true }.
  async function attachItemFile({ companyId, actorId = null, source = defaultSource, legacyId, itemId, buffer, fileName, mimeType, isCover = false, label = null, maxBytes }) {
    fileStore.checkBuffer(buffer, maxBytes);
    const checksum = sha256(buffer);
    const key = { companyId, source, entity: 'inv_item_file', legacyId: legacyId ?? `${itemId}:${checksum}` };
    const previous = await refs.find(key);
    if (previous) return { id: previous, created: false, checksum };
    const item = await prisma.invItem.findFirst({ where: { id: itemId, companyId }, select: { id: true } });
    if (!item) throw new LegacyImportError('El activo no existe en esta empresa.');
    if (await prisma.invItemFile.count({ where: { itemId } }) >= MAX_FILES_PER_ITEM) {
      return { id: null, created: false, overflow: true, checksum, reason: `El activo ya tiene ${MAX_FILES_PER_ITEM} archivos.` };
    }
    let linkId = null;
    const result = await refs.ensure(key, async (tx, assetData) => {
      const asset = await tx.fileAsset.create({ data: { ...assetData, isCover: Boolean(isCover) } });
      const count = await tx.invItemFile.count({ where: { itemId } });
      if (isCover) await tx.invItemFile.updateMany({ where: { itemId }, data: { isCover: false } });
      const link = await tx.invItemFile.create({ data: { itemId, fileAssetId: asset.id, label: clip(label, 100), sortOrder: count, isCover: Boolean(isCover) } });
      linkId = link.id;
      return asset.id;
    }, {
      prepare: () => fileStore.upload({
        companyId, uploadedById: actorId, buffer, fileName, mimeType, moduleKey: MODULE_KEY, entityType: 'InvItem', sourceEntityId: itemId,
        metadata: { label: clip(label, 100), source, legacyId: key.legacyId }, limit: maxBytes,
      }),
      cleanup: (assetData) => fileStore.remove(assetData.objectKey),
    });
    return { ...result, linkId, checksum };
  }

  return { importItem, importAssignment, attachItemFile };
}
