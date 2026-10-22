// inventory-deregistration-act-service.js — acta de baja: the signed document
// that backs every authorized deregistration (one item, or a whole lote).
// The act stores a snapshot of each asset, so the PDF never changes after the
// fact. Spec: docs/superpowers/specs/2026-10-21-inventory-deregistration-act-design.md
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import { createCustodyFileStore } from './inventory-custody-files.js';
import { createUserSignatureService } from './user-signature-service.js';
import { decodeSignaturePng } from './inventory-custody-helpers.js';
import { resolveCompanyBranding } from './pdf-branding-service.js';
import { renderDeregistrationActPdf } from './inventory-deregistration-act-pdf.js';

const MODULE_KEY = 'runly.inventory';
const MAX_FILES_PER_ITEM = 20;
const ACTION_LABELS = {
  migrated: 'Baja migrada', confirm_registration: 'Alta confirmada', propose_deregistration: 'Baja propuesta',
  approve_deregistration: 'Baja autorizada', reject_deregistration: 'Propuesta rechazada', revert_deregistration: 'Baja revertida',
};
const personName = (user) => user?.displayName?.trim() || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || null;

// DATE columns come back as UTC midnight: read the calendar day in UTC, not the local one.
const utcDay = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

export const formatActFolio = (year, sequence) => `BAJA-${year}-${String(sequence).padStart(4, '0')}`;

export function createDeregistrationActService({ prisma, supabaseAdmin, files = null, userSignatures = null, render = renderDeregistrationActPdf }) {
  const store = files ?? createCustodyFileStore({ prisma, supabaseAdmin });
  const savedSignatures = userSignatures ?? createUserSignatureService({ prisma, supabaseAdmin });

  // Validates the signature before anything is written; returns the PNG or null.
  // signature: { pngBase64 } (drawn) | { useSaved: true } (the actor's saved one).
  async function prepareSignature(signature, actorId) {
    if (!signature) return null;
    if (signature.useSaved === true) {
      const saved = actorId ? await savedSignatures.readSaved(actorId) : null;
      if (!saved) throw new InventoryServiceError('No tienes una firma guardada. Guárdala en tu perfil o dibújala.', 409);
      return saved.buffer;
    }
    return decodeSignaturePng(signature.pngBase64);
  }

  // Item data frozen at authorization time; runs inside the transition's transaction
  // because the holder is cleared by the same approval.
  async function snapshotItem(tx, item) {
    const [full, holder] = await Promise.all([
      tx.invItem.findUnique({
        where: { id: item.id },
        include: { category: { select: { name: true } }, brand: { select: { name: true } }, location: { select: { name: true } }, area: { select: { name: true } }, condition: { select: { name: true } } },
      }),
      item.assignedToId ? tx.hrEmployee.findUnique({ where: { id: item.assignedToId }, select: { firstName: true, lastName: true } }) : null,
    ]);
    return {
      itemId: item.id, name: full.name, assetTag: full.assetTag, serialNumber: full.serialNumber, model: full.model,
      brand: full.brand?.name ?? null, category: full.category?.name ?? null, location: full.location?.name ?? null,
      area: full.area?.name ?? null, condition: full.condition?.name ?? null,
      purchaseDate: full.purchaseDate ? utcDay(full.purchaseDate) : null,
      purchasePrice: full.purchasePrice === null ? null : String(full.purchasePrice),
      vendorName: full.vendorName, invoiceNumber: full.invoiceNumber,
      holder: holder ? [holder.firstName, holder.lastName].filter(Boolean).join(' ') : null,
    };
  }

  async function allocateFolio(tx, companyId, year) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inv-dereg-act:${companyId}:${year}`}))::text AS locked`;
    const { _max } = await tx.invDeregistrationAct.aggregate({ where: { companyId, folio: { startsWith: `BAJA-${year}-` } }, _max: { sequence: true } });
    const sequence = (_max.sequence ?? 0) + 1;
    return { sequence, folio: formatActFolio(year, sequence) };
  }

  // Per item: proposal, history (oldest first) and evidence names, read from the event ledger.
  async function describeItems(companyId, snapshots) {
    const itemIds = snapshots.map((s) => s.itemId);
    const events = await prisma.invItemAdminEvent.findMany({
      where: { companyId, itemId: { in: itemIds } }, orderBy: { createdAt: 'asc' },
      include: { actor: { select: { displayName: true, firstName: true, lastName: true, email: true } } },
    });
    const fileIds = [...new Set(events.map((e) => e.fileId).filter(Boolean))];
    const assets = fileIds.length ? await prisma.fileAsset.findMany({ where: { id: { in: fileIds }, entityId: companyId }, select: { id: true, originalName: true } }) : [];
    const nameOf = new Map(assets.map((a) => [a.id, a.originalName]));
    return snapshots.map((snap) => {
      const own = events.filter((e) => e.itemId === snap.itemId);
      const proposal = [...own].reverse().find((e) => e.action === 'propose_deregistration');
      const approval = [...own].reverse().find((e) => e.action === 'approve_deregistration');
      return {
        ...snap,
        reason: approval?.reason ?? proposal?.reason ?? null,
        proposal: proposal ? { by: personName(proposal.actor), at: proposal.createdAt, comment: proposal.comment, reason: proposal.reason } : null,
        history: own.map((e) => ({ label: ACTION_LABELS[e.action] ?? e.action, by: e.actor ? personName(e.actor) : 'Migración', at: e.createdAt, comment: e.comment })),
        evidence: own.filter((e) => e.fileId).map((e) => nameOf.get(e.fileId)).filter(Boolean),
      };
    });
  }

  async function buildPdf(act, signaturePng) {
    const branding = await resolveCompanyBranding({ prisma, companyId: act.companyId });
    return render({ act: { ...act, effectiveDate: utcDay(act.effectiveDate) }, branding, signaturePng });
  }

  async function storeDocument(act, signaturePng, uploadedById) {
    const buffer = await buildPdf(act, signaturePng);
    const asset = await store.store({
      companyId: act.companyId, uploadedById, buffer, fileName: `Acta de baja ${act.folio}.pdf`, mimeType: 'application/pdf',
      entityType: 'InvDeregistrationAct', sourceEntityId: act.id, metadata: { label: 'document' },
    });
    if (act.documentFileId) await prisma.fileAsset.update({ where: { id: act.documentFileId }, data: { enabled: false } }).catch(() => null);
    await prisma.invDeregistrationAct.update({ where: { id: act.id }, data: { documentFileId: asset.id } });
    const label = `Acta de baja ${act.folio}`.slice(0, 100);
    for (const { itemId } of act.items) {
      const count = await prisma.invItemFile.count({ where: { itemId } });
      if (count >= MAX_FILES_PER_ITEM) continue;
      await prisma.invItemFile.create({ data: { itemId, fileAssetId: asset.id, label, sortOrder: count } }).catch(() => null);
    }
    return asset;
  }

  // entries: [{ item, event, snapshot }] of the approvals just committed.
  async function createForApproval({ companyId, actorId, entries, effectiveDate, comment = null, batchId = null, signaturePng = null, approverTitle = null }) {
    assertCompany(companyId);
    if (!entries?.length) return null;
    const approver = actorId
      ? await prisma.userProfile.findUnique({ where: { id: actorId }, select: { displayName: true, firstName: true, lastName: true, email: true } })
      : null;
    const described = await describeItems(companyId, entries.map((e) => e.snapshot));
    const reasons = new Set(described.map((i) => i.reason).filter(Boolean));
    const year = new Date().getFullYear();
    const act = await prisma.$transaction(async (tx) => {
      const { folio, sequence } = await allocateFolio(tx, companyId, year);
      const created = await tx.invDeregistrationAct.create({
        data: {
          companyId, folio, sequence, batchId, effectiveDate: new Date(`${effectiveDate}T00:00:00Z`),
          reason: reasons.size === 1 ? [...reasons][0] : null, comments: comment || null,
          approverId: actorId ?? null, approverName: personName(approver) ?? 'Sin dato', approverTitle: approverTitle?.trim() || null,
          itemCount: described.length, items: described,
        },
      });
      await tx.invItemAdminEvent.updateMany({ where: { id: { in: entries.map((e) => e.event.id) } }, data: { actId: created.id } });
      return created;
    });
    let signatureFileId = null;
    if (signaturePng) {
      const asset = await store.store({
        companyId, uploadedById: actorId, buffer: signaturePng, fileName: `firma-${act.folio}.png`, mimeType: 'image/png',
        entityType: 'InvDeregistrationAct', sourceEntityId: act.id, metadata: { label: 'signature' },
      });
      signatureFileId = asset.id;
      await prisma.invDeregistrationAct.update({ where: { id: act.id }, data: { signatureFileId } });
    }
    await prisma.auditLog.create({
      data: { companyId, actorId: actorId ?? null, moduleKey: MODULE_KEY, entityType: 'InvDeregistrationAct', entityId: act.id, action: 'inventory.deregistration_act.created', after: { folio: act.folio, itemCount: act.itemCount, signed: Boolean(signaturePng) } },
    }).catch(() => null);
    // A rendering failure keeps the act (and its folio); the document can be regenerated.
    try { await storeDocument({ ...act, signatureFileId }, signaturePng, actorId); }
    catch (err) { console.error('[inventory-deregistration-act] document failed', err?.message); }
    return prisma.invDeregistrationAct.findUnique({ where: { id: act.id } });
  }

  async function load(id, companyId) {
    assertCompany(companyId);
    const act = await prisma.invDeregistrationAct.findFirst({ where: { id, companyId } });
    if (!act) throw new InventoryServiceError('Acta no encontrada.', 404);
    return act;
  }

  async function get(id, companyId) {
    const act = await load(id, companyId);
    return { ...act, hasDocument: Boolean(act.documentFileId), signed: Boolean(act.signatureFileId) };
  }

  async function documentUrl(id, companyId) {
    const act = await load(id, companyId);
    const asset = await store.findAsset(companyId, act.documentFileId);
    if (!asset) throw new InventoryServiceError('El acta aún no tiene documento; genérala de nuevo.', 404);
    return store.signedUrl(asset);
  }

  async function regenerate(id, companyId, actorId) {
    const act = await load(id, companyId);
    const asset = await store.findAsset(companyId, act.signatureFileId);
    const signaturePng = asset ? await store.read(asset).catch(() => null) : null;
    await storeDocument(act, signaturePng, actorId);
    return get(id, companyId);
  }

  return { prepareSignature, snapshotItem, createForApproval, get, documentUrl, regenerate };
}
