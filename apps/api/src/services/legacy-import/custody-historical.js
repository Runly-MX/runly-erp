// Historical custody records (resguardos) for legacy migrations: the record is
// written in its final status with a folio from the custody numbering for the
// record's year, the original signed PDF is kept byte for byte (never
// regenerated) and signatures are stored as custody signature files.
// Files are attached in a resumable second step: a rerun fills whatever is
// still missing, so a crash between steps never loses or duplicates a file.
import { assignItemTx, returnItemTx } from '../inventory-assignment-tx.js';
import { buildItemSnapshot, formatCustodyFolio } from '../inventory-custody-helpers.js';
import { LegacyImportError, clip, toDateOnly, toTimestamp, uploadThenWrite, writeImportAudit } from './shared.js';

const MODULE_KEY = 'runly.inventory';
const MAX_FILES_PER_ITEM = 20;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const IMPORT_CUSTODY_STATUSES = ['COMPLETED', 'DRAFT', 'CANCELLED'];
const KINDS = ['DELIVERY', 'RETURN'];
const SNAPSHOT_LIMITS = { typeBrand: 255, model: 255, serialNumber: 255, assetTag: 100, invoiceNumber: 100, features: 2000 };
const ITEM_SELECT = {
  id: true, companyId: true, assetTag: true, model: true, serialNumber: true, invoiceNumber: true, description: true, enabled: true, adminStatus: true,
  category: { select: { name: true } }, brand: { select: { name: true } }, catalogModel: { select: { name: true } },
};

// Buffer or base64 / data-URL string -> PNG buffer (lenient size for legacy).
export function signatureBuffer(input) {
  if (input === undefined || input === null || input === '') return null;
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input).replace(/^data:image\/png;base64,/i, '').replace(/\s+/g, ''), 'base64');
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) throw new LegacyImportError('La firma no es una imagen PNG válida.');
  if (buffer.length > MAX_SIGNATURE_BYTES) throw new LegacyImportError('La firma supera 2 MB.');
  return buffer;
}

export function normalizeCustodyImport(input = {}) {
  const status = String(input.status ?? '').toUpperCase();
  if (!IMPORT_CUSTODY_STATUSES.includes(status)) throw new LegacyImportError(`Estado de resguardo no importable: ${input.status}. Usa ${IMPORT_CUSTODY_STATUSES.join(', ')}.`);
  const kind = String(input.kind ?? 'DELIVERY').toUpperCase();
  if (!KINDS.includes(kind)) throw new LegacyImportError(`Tipo de resguardo no válido: ${input.kind}.`);
  const date = toDateOnly(input.date);
  if (!date) throw new LegacyImportError('El resguardo requiere fecha.');
  if (!input.employeeId) throw new LegacyImportError('El resguardo requiere el colaborador.');
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length || items.some((row) => !row?.itemId)) throw new LegacyImportError('El resguardo requiere al menos un artículo con itemId.');
  if (new Set(items.map((row) => row.itemId)).size !== items.length) throw new LegacyImportError('El resguardo repite un artículo.');
  if (input.applyAssignments === true && status !== 'COMPLETED') throw new LegacyImportError('Solo un resguardo completado puede aplicar asignaciones.');
  const legacyColumn = input.legacyId === undefined || input.legacyId === null ? null : String(input.legacyId).trim();
  if (legacyColumn && legacyColumn.length > 64) throw new LegacyImportError('El identificador legado del resguardo supera 64 caracteres.');
  return { status, kind, date, items, legacyColumn };
}

// Item snapshot: current item data, overridden by what the legacy record says.
export function mergeLegacySnapshot(item, override = {}) {
  const base = buildItemSnapshot(item);
  for (const [key, max] of Object.entries(SNAPSHOT_LIMITS)) if (override && override[key] !== undefined) base[key] = clip(override[key], max);
  return base;
}

export function createCustodyHistorical({ prisma, refs, fileStore, defaultSource }) {
  // Same numbering as inventory-custody-service: per company, kind and year,
  // guarded by an advisory lock; folios already taken are skipped forward.
  async function allocateFolio(tx, companyId, kind, date) {
    const year = date.getUTCFullYear();
    const prefix = formatCustodyFolio(kind, year, 0).replace(/0+$/, '');
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inv-custody:${companyId}:${kind}:${year}`}))::text AS locked`;
    const { _max } = await tx.invCustody.aggregate({ where: { companyId, kind, folio: { startsWith: prefix } }, _max: { sequence: true } });
    for (let sequence = (_max.sequence ?? 0) + 1, tries = 0; tries < 50; sequence += 1, tries += 1) {
      const folio = formatCustodyFolio(kind, year, sequence);
      if (!(await tx.invCustody.findFirst({ where: { companyId, folio }, select: { id: true } }))) return { folio, sequence };
    }
    throw new LegacyImportError('No se pudo asignar un folio.', 'CONFLICT');
  }

  async function applyAssignments(tx, { custody, rows, actorId, warnings }) {
    const notes = `Resguardo ${custody.folio}`;
    for (const row of rows) {
      const item = await tx.invItem.findFirst({ where: { id: row.itemId }, select: { assetTag: true, adminStatus: true } });
      const active = await tx.invAssignment.findFirst({ where: { itemId: row.itemId, returnedAt: null }, orderBy: { assignedAt: 'desc' } });
      let assignmentId = null;
      if (custody.kind === 'DELIVERY') {
        if (active && active.employeeId === custody.employeeId) assignmentId = active.id;
        else if (active) warnings.push(`${item.assetTag}: ya está asignado a otro colaborador; no se reasignó.`);
        else if (item.adminStatus === 'deregistered') warnings.push(`${item.assetTag}: está dado de baja; no se asignó.`);
        else ({ assignment: { id: assignmentId } } = await assignItemTx(tx, { itemId: row.itemId, employeeId: custody.employeeId, assignedById: actorId, notes, assignedAt: custody.date }));
      } else if (active && active.employeeId === custody.employeeId) {
        assignmentId = active.id;
        await returnItemTx(tx, { assignmentId: active.id, itemId: row.itemId, returnedAt: custody.date < active.assignedAt ? active.assignedAt : custody.date });
      } else {
        warnings.push(`${item.assetTag}: no tiene una asignación activa con este colaborador; no se registró la devolución.`);
      }
      if (assignmentId) await tx.invCustodyItem.update({ where: { id: row.id }, data: { assignmentId } });
    }
  }

  async function storeCustodyFile(custody, actorId, { buffer, fileName, mimeType, label, update, linkItems = false, source, legacyId }, warnings) {
    return uploadThenWrite(prisma, fileStore, {
      companyId: custody.companyId, uploadedById: actorId, buffer, fileName, mimeType, moduleKey: MODULE_KEY, entityType: 'InvCustody',
      sourceEntityId: custody.id, metadata: { label, source, legacyId },
    }, async (tx, assetData) => {
      const asset = await tx.fileAsset.create({ data: assetData });
      await tx.invCustody.update({ where: { id: custody.id }, data: update(asset.id) });
      if (linkItems) {
        const linkLabel = `Resguardo ${custody.folio}`.slice(0, 100);
        for (const { itemId } of custody.items) {
          // Legacy systems often already attached the same PDF to the item: link it once.
          const same = assetData.checksum ? await tx.invItemFile.findFirst({ where: { itemId, fileAsset: { checksum: assetData.checksum } }, select: { id: true } }) : null;
          if (same) continue;
          const count = await tx.invItemFile.count({ where: { itemId } });
          if (count >= MAX_FILES_PER_ITEM) { warnings.push(`El activo ${itemId} ya tiene ${MAX_FILES_PER_ITEM} archivos; el documento no se vinculó.`); continue; }
          await tx.invItemFile.create({ data: { itemId, fileAssetId: asset.id, label: linkLabel, sortOrder: count } });
        }
      }
      return asset;
    });
  }

  // Fills the files a record still lacks (document, signatures).
  async function attachMissingFiles(custodyId, actorId, input, source, legacyId, warnings) {
    const custody = await prisma.invCustody.findUnique({ where: { id: custodyId }, include: { items: { select: { itemId: true } } } });
    const signedAt = toTimestamp(input.signedAt ?? input.date);
    if (input.documentBuffer && !custody.documentFileId) {
      fileStore.checkBuffer(input.documentBuffer);
      await storeCustodyFile(custody, actorId, {
        buffer: input.documentBuffer, fileName: input.documentFileName || `${custody.folio}.pdf`, mimeType: input.documentMimeType || 'application/pdf',
        label: 'document', update: (fileId) => ({ documentFileId: fileId }), linkItems: true, source, legacyId,
      }, warnings);
    }
    const receiver = signatureBuffer(input.receiverSignaturePng);
    if (receiver && !custody.receiverSignatureFileId) {
      await storeCustodyFile(custody, actorId, {
        buffer: receiver, fileName: `firma-receiver-${custody.folio}.png`, mimeType: 'image/png', label: 'signature:receiver',
        update: (fileId) => ({ receiverSignatureFileId: fileId, receiverSignedAt: signedAt }), source, legacyId,
      }, warnings);
    }
    const deliverer = signatureBuffer(input.delivererSignaturePng);
    if (deliverer && !custody.delivererSignatureFileId) {
      await storeCustodyFile(custody, actorId, {
        buffer: deliverer, fileName: `firma-deliverer-${custody.folio}.png`, mimeType: 'image/png', label: 'signature:deliverer',
        update: (fileId) => ({ delivererSignatureFileId: fileId, delivererSignedAt: signedAt }), source, legacyId,
      }, warnings);
    }
    return prisma.invCustody.findUnique({
      where: { id: custodyId }, select: { id: true, folio: true, status: true, documentFileId: true, receiverSignatureFileId: true, delivererSignatureFileId: true },
    });
  }

  // Returns { id, folio, created, warnings, documentFileId, receiverSignatureFileId, delivererSignatureFileId }.
  async function importCustody({ companyId, actorId, source = defaultSource, legacyId, employeeId, delivererId = null, delivererName = null, comments = null, applyAssignments: apply = false, ...rest }) {
    if (!actorId) throw new LegacyImportError('importCustody requiere actorId (perfil de la migración).');
    const input = { ...rest, employeeId, legacyId, applyAssignments: apply };
    const { status, kind, date, items, legacyColumn } = normalizeCustodyImport(input);
    const key = { companyId, source, entity: 'inv_custody', legacyId };
    const warnings = [];
    let custodyId = await refs.find(key);
    let created = false;
    if (!custodyId && legacyColumn) {
      const existing = await prisma.invCustody.findFirst({ where: { companyId, legacyId: legacyColumn }, select: { id: true } });
      if (existing) {
        await prisma.$transaction((tx) => refs.remember(tx, key, existing.id));
        custodyId = existing.id;
      }
    }
    if (!custodyId) {
      const [employee, deliverer, rows] = await Promise.all([
        prisma.hrEmployee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } }),
        delivererId ? prisma.userProfile.findFirst({ where: { id: delivererId }, select: { id: true } }) : null,
        prisma.invItem.findMany({ where: { companyId, id: { in: items.map((row) => row.itemId) } }, select: ITEM_SELECT }),
      ]);
      if (!employee) throw new LegacyImportError('El colaborador no existe en esta empresa.');
      if (delivererId && !deliverer) throw new LegacyImportError('El usuario que entrega no existe.');
      if (rows.length !== items.length) throw new LegacyImportError('Uno o más artículos del resguardo no existen en esta empresa.');
      const byId = new Map(rows.map((row) => [row.id, row]));
      const result = await refs.ensure(key, async (tx) => {
        const { folio, sequence } = await allocateFolio(tx, companyId, kind, date);
        const custody = await tx.invCustody.create({
          data: {
            companyId, folio, sequence, kind, status, employeeId, date, comments: clip(comments, 2000),
            delivererId: delivererId || null, delivererName: delivererId ? null : clip(delivererName, 200),
            source: String(source).slice(0, 20), legacyId: legacyColumn, createdById: actorId,
            completedAt: status === 'COMPLETED' ? toTimestamp(rest.completedAt ?? date) : null,
            cancelledAt: status === 'CANCELLED' ? toTimestamp(rest.cancelledAt ?? date) : null,
            cancelReason: status === 'CANCELLED' ? clip(rest.cancelReason, 500) : null,
            ...(rest.createdAt ? { createdAt: toTimestamp(rest.createdAt) } : {}),
            items: { create: items.map((row, index) => ({ itemId: row.itemId, sortOrder: index, ...mergeLegacySnapshot(byId.get(row.itemId), row.snapshot) })) },
          },
          include: { items: true },
        });
        if (apply) await applyAssignments(tx, { custody, rows: custody.items, actorId, warnings });
        await writeImportAudit(tx, {
          companyId, actorId, moduleKey: MODULE_KEY, entityType: 'InvCustody', entityId: custody.id, action: 'inventory.custody.imported',
          after: { folio, kind, status, itemIds: items.map((row) => row.itemId) }, source, legacyId, extra: { applyAssignments: apply },
        });
        return custody.id;
      }, { timeout: 120_000 });
      custodyId = result.id;
      created = result.created;
    }
    const files = await attachMissingFiles(custodyId, actorId, { ...rest, date }, source, String(legacyId), warnings);
    return { ...files, created, warnings };
  }

  return { importCustody };
}
