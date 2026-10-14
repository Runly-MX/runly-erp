// runly.inventory custody records (resguardos): numbered, signed deliveries
// and returns of items to an employee.
// Spec: docs/superpowers/specs/2026-10-13-inventory-custody-design.md
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import { assignItemTx, returnItemTx } from './inventory-assignment-tx.js';
import { createCustodyFileStore } from './inventory-custody-files.js';
import { createCustodyDocumentRenderer } from './inventory-custody-document.js';
import { createInventoryDocumentTemplateService } from './inventory-document-template-service.js';
import { createSmtpService } from './smtp-service.js';
import { createCompanyBrandService } from './company-brand-service.js';
import { createUserSignatureService } from './user-signature-service.js';
import { createCustodyDeliverers } from './inventory-custody-deliverers.js';
import {
  assertCustodyAction, assertDelivererChoice, buildItemSnapshot, completionConflicts, decodeSignaturePng, formatCustodyFolio,
  generatePublicToken, hashToken, isPlausibleToken, isTokenUsable, normalizeCustodyInput, savedSignatureDecision, signatureResetFor,
} from './inventory-custody-helpers.js';

const MODULE_KEY = 'runly.inventory';
// DATE columns come back as UTC midnight: read them with UTC getters.
const dateOnly = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const ITEM_SNAPSHOT_SELECT = {
  id: true, companyId: true, assetTag: true, model: true, serialNumber: true, invoiceNumber: true, description: true,
  enabled: true, adminStatus: true, assignedToId: true,
  category: { select: { name: true } }, brand: { select: { name: true } }, catalogModel: { select: { name: true } },
};
const CUSTODY_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  employee: {
    select: {
      id: true, firstName: true, lastName: true, employeeCode: true, workEmail: true, personalEmail: true,
      department: true, jobTitle: true, departmentRef: { select: { name: true } }, jobTitleRef: { select: { name: true } },
    },
  },
  deliverer: { select: { id: true, displayName: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, displayName: true } },
  template: { select: { id: true, name: true, format: true } },
};

export function serializeCustody(row) {
  if (!row) return row;
  const { publicTokenHash, ...rest } = row;
  return {
    ...rest,
    itemCount: row.items?.length ?? row._count?.items ?? 0,
    receiverSigned: Boolean(row.receiverSignatureFileId),
    delivererSigned: Boolean(row.delivererSignatureFileId),
    hasPublicLink: Boolean(publicTokenHash) && Boolean(row.tokenExpiresAt) && new Date(row.tokenExpiresAt) > new Date(),
    hasDocument: Boolean(row.documentFileId),
  };
}

function appBaseUrl(env, origin) {
  for (const candidate of [env.RUNLY_APP_URL, env.APP_URL, env.PUBLIC_APP_URL, env.WEB_APP_URL, origin]) {
    try {
      if (candidate) return new URL(candidate).origin;
    } catch { /* next candidate */ }
  }
  return '';
}

export function createInventoryCustodyService({ prisma, supabaseAdmin = null, env = process.env, smtpFactory, convert, userSignatures = null } = {}) {
  const files = createCustodyFileStore({ prisma, supabaseAdmin });
  const deliverers = createCustodyDeliverers({ prisma, supabaseAdmin });
  const savedSignatures = userSignatures ?? createUserSignatureService({ prisma, supabaseAdmin });
  const brand = createCompanyBrandService({ prisma, supabaseAdmin });
  const templates = createInventoryDocumentTemplateService({ prisma, supabaseAdmin });
  const documents = createCustodyDocumentRenderer({
    prisma, files, templates, convert,
    smtpFactory: smtpFactory ?? ((companyId) => createSmtpService({ prisma, companyId })),
  });

  const audit = (companyId, actorId, entityId, action, after = null, metadata = null) => prisma.auditLog.create({
    data: {
      companyId, actorId: actorId ?? null, moduleKey: MODULE_KEY, entityType: 'InvCustody', entityId, action,
      ...(after ? { after } : {}), ...(metadata ? { metadata } : {}),
    },
  }).catch(() => null);

  async function load(id, companyId, db = prisma) {
    assertCompany(companyId);
    const row = await db.invCustody.findFirst({ where: { id, companyId }, include: CUSTODY_INCLUDE });
    if (!row) throw new InventoryServiceError('Resguardo no encontrado.', 404);
    return row;
  }

  async function loadItems(db, companyId, itemIds) {
    const items = await db.invItem.findMany({ where: { id: { in: itemIds }, companyId }, select: ITEM_SNAPSHOT_SELECT });
    if (items.length !== itemIds.length || items.some((item) => !item.enabled)) {
      throw new InventoryServiceError('Uno o más artículos no existen en esta empresa.', 400);
    }
    const byId = new Map(items.map((item) => [item.id, item]));
    return itemIds.map((id) => byId.get(id));
  }

  const snapshotRows = (items) => items.map((item, index) => ({ itemId: item.id, sortOrder: index, ...buildItemSnapshot(item) }));

  async function assertEmployee(db, companyId, employeeId) {
    const employee = await db.hrEmployee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
    if (!employee) throw new InventoryServiceError('El colaborador no existe en esta empresa.', 400);
  }

  async function assertTemplate(db, companyId, templateId) {
    if (!templateId) return;
    const row = await db.invDocumentTemplate.findFirst({ where: { id: templateId, companyId, enabled: true }, select: { id: true } });
    if (!row) throw new InventoryServiceError('La plantilla no existe.', 400);
  }

  // Next folio for the kind and year, guarded by an advisory lock (same
  // pattern as purchases numbering). Migrated folios are skipped forward.
  async function allocateFolio(tx, companyId, kind, date) {
    const year = date.getUTCFullYear();
    const prefix = formatCustodyFolio(kind, year, 0).replace(/0+$/, '');
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inv-custody:${companyId}:${kind}:${year}`}))::text AS locked`;
    const { _max } = await tx.invCustody.aggregate({ where: { companyId, kind, folio: { startsWith: prefix } }, _max: { sequence: true } });
    for (let sequence = (_max.sequence ?? 0) + 1, tries = 0; tries < 50; sequence += 1, tries += 1) {
      const folio = formatCustodyFolio(kind, year, sequence);
      if (!(await tx.invCustody.findFirst({ where: { companyId, folio }, select: { id: true } }))) return { folio, sequence };
    }
    throw new InventoryServiceError('No se pudo asignar un folio. Intenta de nuevo.', 409);
  }

  async function list({ companyId, status, employeeId, itemId, q, page = 1, pageSize = 25 }) {
    assertCompany(companyId);
    const take = Math.min(Math.max(Number.parseInt(pageSize, 10) || 25, 1), 100);
    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const where = { companyId };
    const statuses = String(status ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (statuses.length) where.status = { in: statuses };
    if (employeeId) where.employeeId = String(employeeId);
    if (itemId) where.items = { some: { itemId: String(itemId) } };
    const search = String(q ?? '').trim();
    if (search) {
      where.OR = [
        { folio: { contains: search, mode: 'insensitive' } },
        { employee: { firstName: { contains: search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: search, mode: 'insensitive' } } },
        { items: { some: { OR: [{ assetTag: { contains: search, mode: 'insensitive' } }, { serialNumber: { contains: search, mode: 'insensitive' } }] } } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.invCustody.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          template: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (currentPage - 1) * take,
        take,
      }),
      prisma.invCustody.count({ where }),
    ]);
    return { items: rows.map(serializeCustody), total, page: currentPage, pageSize: take };
  }

  async function get(id, companyId) {
    return serializeCustody(await load(id, companyId));
  }

  // Deliverer: a company user (default: the caller); someone else, or a free
  // text name, requires deliver_on_behalf (spec §9.5).
  async function checkDeliverer(input, companyId, profileId, canDeliverOnBehalf) {
    if (input.delivererName && !input.delivererId) assertDelivererChoice({ actorId: profileId, delivererId: 'external', canDeliverOnBehalf });
    if (!input.delivererId) return;
    assertDelivererChoice({ actorId: profileId, delivererId: input.delivererId, canDeliverOnBehalf });
    await deliverers.assertMember(companyId, input.delivererId);
  }

  async function create(body, companyId, profileId, { canDeliverOnBehalf = false } = {}) {
    assertCompany(companyId);
    if (!profileId) throw new InventoryServiceError('Usuario no encontrado.', 400);
    const input = normalizeCustodyInput(body);
    await checkDeliverer(input, companyId, profileId, canDeliverOnBehalf);
    await assertEmployee(prisma, companyId, input.employeeId);
    await assertTemplate(prisma, companyId, input.templateId);
    const items = await loadItems(prisma, companyId, input.itemIds);
    const created = await prisma.$transaction(async (tx) => {
      const { folio, sequence } = await allocateFolio(tx, companyId, input.kind, input.date);
      return tx.invCustody.create({
        data: {
          companyId, folio, sequence, kind: input.kind, employeeId: input.employeeId, date: input.date,
          comments: input.comments ?? null, templateId: input.templateId ?? null,
          delivererName: input.delivererId ? null : (input.delivererName ?? null),
          delivererId: input.delivererId || (input.delivererName ? null : profileId),
          createdById: profileId,
          items: { create: snapshotRows(items) },
        },
      });
    });
    await audit(companyId, profileId, created.id, 'inventory.custody.created', { folio: created.folio, kind: created.kind, itemIds: input.itemIds });
    return get(created.id, companyId);
  }

  // DRAFT or PENDING_SIGNATURE (spec §9.4). itemIds is the full replacement
  // list. Changing kind, employee or items clears both signatures, changing
  // the deliverer clears the deliverer's; the status and link are kept.
  async function update(id, body, companyId, profileId, { canDeliverOnBehalf = false } = {}) {
    const current = await load(id, companyId);
    assertCustodyAction(current, 'update');
    const input = normalizeCustodyInput(body, { partial: true });
    if (input.delivererId === null) throw new InventoryServiceError('Selecciona quién entrega.', 400);
    if (input.delivererId && input.delivererId !== current.delivererId) await checkDeliverer(input, companyId, profileId, canDeliverOnBehalf);
    else if (input.delivererName !== undefined && !input.delivererId) await checkDeliverer(input, companyId, profileId, canDeliverOnBehalf);
    if (input.employeeId) await assertEmployee(prisma, companyId, input.employeeId);
    if (input.templateId) await assertTemplate(prisma, companyId, input.templateId);
    const reset = signatureResetFor(current, input);
    const itemsChanged = input.itemIds !== undefined && input.itemIds.join(',') !== current.items.map((row) => row.itemId).join(',');
    const items = itemsChanged ? await loadItems(prisma, companyId, input.itemIds) : null;
    const { itemIds, ...fields } = input;
    if (fields.delivererId) fields.delivererName = null;
    const cleared = [
      ...(reset.receiver && current.receiverSignatureFileId ? [current.receiverSignatureFileId] : []),
      ...(reset.deliverer && current.delivererSignatureFileId ? [current.delivererSignatureFileId] : []),
    ];
    await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.invCustodyItem.deleteMany({ where: { custodyId: id } });
        await tx.invCustodyItem.createMany({ data: snapshotRows(items).map((row) => ({ ...row, custodyId: id })) });
      }
      await tx.invCustody.update({
        where: { id },
        data: {
          ...fields,
          ...(reset.receiver ? { receiverSignatureFileId: null, receiverSignedAt: null } : {}),
          ...(reset.deliverer ? { delivererSignatureFileId: null, delivererSignedAt: null } : {}),
        },
      });
      if (cleared.length) await tx.fileAsset.updateMany({ where: { id: { in: cleared } }, data: { enabled: false } });
    });
    await audit(companyId, profileId, id, 'inventory.custody.updated', {
      fields: Object.keys(input), status: current.status, clearedSignatures: cleared.length ? reset : undefined,
    });
    return get(id, companyId);
  }

  async function storeSignature(custody, role, pngBase64, uploadedById, { buffer: savedBuffer = null } = {}) {
    const buffer = savedBuffer ?? decodeSignaturePng(pngBase64);
    const asset = await files.store({
      companyId: custody.companyId, uploadedById, buffer, fileName: `firma-${role}-${custody.folio}.png`, mimeType: 'image/png',
      entityType: 'InvCustody', sourceEntityId: custody.id, metadata: { label: `signature:${role}` },
    });
    const previous = role === 'receiver' ? custody.receiverSignatureFileId : custody.delivererSignatureFileId;
    if (previous) await prisma.fileAsset.update({ where: { id: previous }, data: { enabled: false } }).catch(() => null);
    const now = new Date();
    return role === 'receiver'
      ? { receiverSignatureFileId: asset.id, receiverSignedAt: now }
      : { delivererSignatureFileId: asset.id, delivererSignedAt: now };
  }

  // { role: 'deliverer', useSaved: true }: copies the deliverer's saved
  // signature into a new custody file (spec §9.6), so deleting the saved one
  // never breaks the record. Every use is audited with the actor.
  async function signWithSaved(custody, profileId, canDeliverOnBehalf) {
    const ownerId = custody.delivererId ?? (custody.delivererName ? null : profileId);
    const saved = ownerId ? await savedSignatures.readSaved(ownerId) : null;
    const decision = savedSignatureDecision({ actorId: profileId, ownerId, canDeliverOnBehalf, allowDelegation: saved?.allowDelegation ?? false });
    if (!decision.allowed) throw new InventoryServiceError(decision.reason, ownerId ? 403 : 400);
    if (!saved) throw new InventoryServiceError(ownerId === profileId ? 'No tienes una firma guardada. Guárdala en tu perfil.' : 'Quien entrega no tiene una firma guardada.', 409);
    const data = await storeSignature(custody, 'deliverer', null, profileId, { buffer: saved.buffer });
    if (!custody.delivererId) data.delivererId = ownerId;
    await prisma.invCustody.update({ where: { id: custody.id }, data });
    const names = await deliverers.names([ownerId, profileId]);
    await audit(custody.companyId, profileId, custody.id, 'inventory.custody.signed', {
      role: 'deliverer', via: 'saved_signature', signatureOwnerId: ownerId, appliedById: profileId,
    }, { summary: `Firma guardada de ${names.get(ownerId) ?? 'quien entrega'} aplicada por ${names.get(profileId) ?? 'un usuario'}` });
    return get(custody.id, custody.companyId);
  }

  async function sign(id, { role, pngBase64, useSaved } = {}, companyId, profileId, { canDeliverOnBehalf = false } = {}) {
    if (!['receiver', 'deliverer'].includes(role)) throw new InventoryServiceError('Indica quién firma (receiver o deliverer).', 400);
    const custody = await load(id, companyId);
    assertCustodyAction(custody, 'sign');
    if (useSaved === true) {
      if (role !== 'deliverer') throw new InventoryServiceError('Solo quien entrega puede usar una firma guardada.', 400);
      return signWithSaved(custody, profileId, canDeliverOnBehalf);
    }
    const data = await storeSignature(custody, role, pngBase64, profileId);
    if (role === 'deliverer' && !custody.delivererId && !custody.delivererName) data.delivererId = profileId;
    await prisma.invCustody.update({ where: { id }, data });
    await audit(companyId, profileId, id, 'inventory.custody.signed', { role, via: 'app' });
    return get(id, companyId);
  }

  async function refreshSnapshot(custody) {
    const items = await loadItems(prisma, custody.companyId, custody.items.map((row) => row.itemId));
    await prisma.$transaction(snapshotRows(items).map(({ itemId, sortOrder, ...snapshot }) => prisma.invCustodyItem.updateMany({
      where: { custodyId: custody.id, itemId }, data: { ...snapshot, sortOrder },
    })));
  }

  async function createPublicLink(id, companyId, profileId, { origin, sendEmail = false } = {}) {
    const custody = await load(id, companyId);
    assertCustodyAction(custody, 'publicLink');
    if (!custody.items.length) throw new InventoryServiceError('Agrega al menos un artículo al resguardo.', 409);
    if (custody.status === 'DRAFT' && !custody.receiverSignatureFileId) await refreshSnapshot(custody);
    const { token, hash, expiresAt } = generatePublicToken();
    await prisma.invCustody.update({ where: { id }, data: { status: 'PENDING_SIGNATURE', publicTokenHash: hash, tokenExpiresAt: expiresAt } });
    const path = `/sign/custody/${token}`;
    const url = `${appBaseUrl(env, origin)}${path}`;
    // Best effort; only an absolute link is worth e-mailing.
    const emailSent = sendEmail === true && /^https?:\/\//.test(url)
      ? await documents.emailSigningLink(custody, url, expiresAt)
      : false;
    await audit(companyId, profileId, id, 'inventory.custody.public_link', { expiresAt: expiresAt.toISOString(), emailSent });
    return { url, path, token, expiresAt, emailSent };
  }

  async function applyAssignments(tx, custody, profileId) {
    const itemIds = custody.items.map((row) => row.itemId);
    const [items, active] = await Promise.all([
      tx.invItem.findMany({ where: { id: { in: itemIds }, companyId: custody.companyId }, select: ITEM_SNAPSHOT_SELECT }),
      tx.invAssignment.findMany({ where: { itemId: { in: itemIds }, returnedAt: null }, orderBy: { assignedAt: 'desc' } }),
    ]);
    const activeByItem = new Map();
    for (const row of active) if (!activeByItem.has(row.itemId)) activeByItem.set(row.itemId, row);
    const problems = completionConflicts({ kind: custody.kind, employeeId: custody.employeeId, items, itemIds, activeByItem });
    if (problems.length) throw new InventoryServiceError(problems.slice(0, 5).join(' ') + (problems.length > 5 ? ` (y ${problems.length - 5} más)` : ''), 409);
    const notes = `Resguardo ${custody.folio}`;
    for (const row of custody.items) {
      const current = activeByItem.get(row.itemId);
      let assignmentId = current?.id ?? null;
      if (custody.kind === 'DELIVERY' && !current) {
        ({ assignment: { id: assignmentId } } = await assignItemTx(tx, { itemId: row.itemId, employeeId: custody.employeeId, assignedById: profileId, notes, assignedAt: custody.date }));
      } else if (custody.kind === 'RETURN') {
        const returnedAt = custody.date < current.assignedAt ? new Date() : custody.date;
        await returnItemTx(tx, { assignmentId: current.id, itemId: row.itemId, returnedAt });
      }
      await tx.invCustodyItem.update({ where: { id: row.id }, data: { assignmentId } });
    }
  }

  async function complete(id, companyId, profileId, { allowUnsigned = false, sendEmail = true } = {}) {
    if (!profileId) throw new InventoryServiceError('Usuario no encontrado.', 400);
    const custody = await load(id, companyId);
    assertCustodyAction(custody, 'complete');
    if (!custody.items.length) throw new InventoryServiceError('Agrega al menos un artículo al resguardo.', 409);
    if (!custody.receiverSignatureFileId && allowUnsigned !== true) {
      throw new InventoryServiceError('Falta la firma de quien recibe. Captúrala o envía el enlace de firma.', 409);
    }
    if (custody.status === 'DRAFT' && !custody.receiverSignatureFileId && !custody.delivererSignatureFileId) await refreshSnapshot(custody);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id::text FROM inv_custody WHERE id = ${id}::uuid FOR UPDATE`;
      const fresh = await load(id, companyId, tx);
      assertCustodyAction(fresh, 'complete');
      await applyAssignments(tx, fresh, profileId);
      await tx.invCustody.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), publicTokenHash: null, tokenExpiresAt: null, delivererId: fresh.delivererId ?? (fresh.delivererName ? null : profileId) },
      });
    }, { timeout: 60_000, maxWait: 10_000 });
    await audit(companyId, profileId, id, 'inventory.custody.completed', { folio: custody.folio, kind: custody.kind, itemIds: custody.items.map((row) => row.itemId) }, allowUnsigned === true && !custody.receiverSignatureFileId ? { allowUnsigned: true } : null);

    let documentError = null;
    let emailSent = false;
    try {
      const completed = await load(id, companyId);
      const { document } = await documents.generateAndAttach(completed, { profileId });
      if (sendEmail !== false) emailSent = await documents.emailToEmployee(completed, document);
    } catch (err) {
      documentError = err instanceof InventoryServiceError ? err.message : 'No se pudo generar el documento del resguardo.';
    }
    return { custody: await get(id, companyId), emailSent, documentError };
  }

  // Regenerates the document of a completed record that has none (e.g. the
  // first attempt failed).
  async function regenerateDocument(id, companyId, profileId) {
    const custody = await load(id, companyId);
    if (custody.status !== 'COMPLETED') throw new InventoryServiceError('Solo los resguardos completados tienen documento final.', 409);
    if (custody.documentFileId) return get(id, companyId);
    await documents.generateAndAttach(custody, { profileId });
    return get(id, companyId);
  }

  async function cancel(id, { reason } = {}, companyId, profileId) {
    const custody = await load(id, companyId);
    assertCustodyAction(custody, 'cancel');
    const cleanReason = String(reason ?? '').trim().slice(0, 500);
    if (cleanReason.length < 3) throw new InventoryServiceError('Escribe el motivo de la cancelación.', 400);
    await prisma.invCustody.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: cleanReason, publicTokenHash: null, tokenExpiresAt: null },
    });
    await audit(companyId, profileId, id, 'inventory.custody.cancelled', { reason: cleanReason, previousStatus: custody.status });
    return get(id, companyId);
  }

  async function documentUrl(id, companyId) {
    const custody = await load(id, companyId);
    const asset = await files.findAsset(companyId, custody.documentFileId);
    if (!asset) throw new InventoryServiceError('El resguardo aún no tiene documento.', 404);
    const { url, expiresIn } = await files.signedUrl(asset);
    return { url, expiresIn, fileName: asset.originalName, mimeType: asset.mimeType };
  }

  async function preview(id, companyId) {
    const custody = await load(id, companyId);
    assertCustodyAction(custody, 'preview');
    return documents.render(custody);
  }

  // ── Public signing link ────────────────────────────────────────────────
  async function findByToken(token) {
    if (!isPlausibleToken(token)) throw new InventoryServiceError('Enlace no disponible.', 404);
    const custody = await prisma.invCustody.findUnique({ where: { publicTokenHash: hashToken(token) }, include: CUSTODY_INCLUDE });
    if (!custody) throw new InventoryServiceError('Enlace no disponible.', 404);
    if (!isTokenUsable(custody)) throw new InventoryServiceError('El enlace de firma venció o ya no está disponible.', 410);
    return custody;
  }

  async function getPublic(token) {
    const custody = await findByToken(token);
    const [company, companyBrand] = await Promise.all([
      prisma.company.findUnique({ where: { id: custody.companyId }, select: { name: true } }),
      brand.getBrandForCompany(custody.companyId),
    ]);
    const { employee, deliverer } = custody;
    const delivererFullName = deliverer ? (deliverer.displayName?.trim() || [deliverer.firstName, deliverer.lastName].filter(Boolean).join(' ')) : '';
    // Employee number and e-mail stay private (spec §7, §9.3).
    return {
      folio: custody.folio,
      kind: custody.kind,
      date: dateOnly(custody.date),
      status: custody.status,
      companyName: company?.name ?? '',
      companyLogoUrl: companyBrand?.logoUrl ?? null,
      receiverName: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
      receiverDepartment: employee.departmentRef?.name ?? employee.department ?? null,
      receiverJobTitle: employee.jobTitleRef?.name ?? employee.jobTitle ?? null,
      delivererName: custody.delivererName || delivererFullName || null,
      itemCount: custody.items.length,
      items: custody.items.map(({ typeBrand, model, serialNumber, assetTag, invoiceNumber, features }, index) => ({
        index: index + 1, typeBrand, model, serialNumber, assetTag, invoiceNumber, features,
      })),
      comments: custody.comments ?? null,
      receiverSigned: Boolean(custody.receiverSignatureFileId),
      expiresAt: custody.tokenExpiresAt,
    };
  }

  async function signPublic(token, { pngBase64 } = {}) {
    const custody = await findByToken(token);
    const data = await storeSignature(custody, 'receiver', pngBase64, null);
    await prisma.invCustody.update({ where: { id: custody.id }, data });
    await audit(custody.companyId, null, custody.id, 'inventory.custody.signed', { role: 'receiver', via: 'public_link' });
    return { ok: true, signedAt: data.receiverSignedAt };
  }

  return {
    list, get, create, update, sign, createPublicLink, complete, regenerateDocument, cancel, documentUrl, preview,
    getPublic, signPublic, templates,
    listDeliverers: deliverers.list,
  };
}
