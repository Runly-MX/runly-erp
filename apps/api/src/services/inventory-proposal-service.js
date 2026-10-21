// inventory-proposal-service.js - change proposals for items the proposer cannot open (spec
// 2026-10-21-inventory-change-proposals-design). A restricted duplicate (same serial / asset number as an item
// in a folder the caller has no access to) can be answered with values to review or an access request, instead
// of a dead end. The proposer never learns anything about the item; reviewers with write access to its area
// decide field by field, and accepted fields go through the normal updateItem path.
import { z } from 'zod';
import { InventoryServiceError } from './inventory-guards.js';
import { cleanIdentifier } from './inventory-identifiers.js';
import { canWriteArea } from './inventory-scope.js';

const uuid = z.string().uuid();
const plain = (max) => z.string().trim().max(max);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}/).max(30);

// Fields that can be proposed: what describes an item. Identifiers, status, area and commercial data are not here.
const FIELDS = {
  name: { schema: plain(255), label: 'Nombre' },
  model: { schema: plain(255), label: 'Modelo' },
  modelId: { schema: uuid, label: 'Modelo del catálogo', relation: 'model' },
  categoryId: { schema: uuid, label: 'Tipo', relation: 'category' },
  brandId: { schema: uuid, label: 'Marca', relation: 'brand' },
  locationId: { schema: uuid, label: 'Ubicación', relation: 'location' },
  conditionId: { schema: uuid, label: 'Condición', relation: 'condition' },
  partNumber: { schema: plain(255), label: 'Número de parte' },
  warrantyExpiry: { schema: dateOnly, label: 'Vencimiento de garantía' },
  warrantyNotes: { schema: plain(2000), label: 'Notas de garantía' },
  notes: { schema: plain(2000), label: 'Notas' },
};
export const PROPOSABLE_FIELDS = Object.keys(FIELDS);
export const PROPOSAL_FIELD_LABELS = Object.fromEntries(Object.entries(FIELDS).map(([key, f]) => [key, f.label]));

const MATCH_FIELDS = ['serialNumber', 'assetTag'];
const change = z.object({ value: z.string().nullable(), label: plain(255).nullish() }).strict();
const submitSchema = z.object({
  kind: z.enum(['change', 'access_request']).default('change'),
  matchedField: z.enum(MATCH_FIELDS),
  matchedValue: plain(255).min(1),
  changes: z.record(z.string(), change).default({}),
  message: plain(1000).nullish(),
}).strict();

const reviewSchema = z.object({
  decisions: z.record(z.string(), z.enum(['accept', 'reject'])).default({}),
  note: plain(1000).nullish(),
}).strict();

const RELATION_NAME = { category: 'category', brand: 'brand', location: 'location', condition: 'condition' };
// DATE columns arrive as UTC midnight: read them with the UTC getters so the day never shifts.
function iso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function createInventoryProposalService({ prisma, inventoryService = null }) {
  // Validates the proposed values against the allowlist; empty values are dropped.
  function parseChanges(raw) {
    const out = {};
    for (const [field, entry] of Object.entries(raw)) {
      const def = FIELDS[field];
      if (!def) throw new InventoryServiceError(`No puedes proponer el campo ${field}.`, 400, 'FIELD_NOT_ALLOWED', { fields: [field] });
      const value = entry.value === null ? null : String(entry.value).trim();
      if (value === null || value === '') continue;
      if (!def.schema.safeParse(value).success) throw new InventoryServiceError(`Valor no válido en ${def.label}.`, 400, 'INVALID_BODY');
      out[field] = { value, ...(def.relation && entry.label ? { label: String(entry.label).slice(0, 255) } : {}) };
    }
    return out;
  }

  // proposer: { userId?, guestId?, label }. Answers { id, status } only: nothing about the item.
  async function submit({ companyId, proposer, body }) {
    const parsed = submitSchema.safeParse(body && typeof body === 'object' ? body : {});
    if (!parsed.success) throw new InventoryServiceError('Datos inválidos.', 400, 'INVALID_BODY');
    const data = parsed.data;
    const changes = data.kind === 'change' ? parseChanges(data.changes) : {};
    if (data.kind === 'change' && Object.keys(changes).length === 0) {
      throw new InventoryServiceError('Elige al menos un dato para enviar a revisión.', 400, 'NOTHING_TO_PROPOSE');
    }
    const value = cleanIdentifier(data.matchedValue);
    const item = await prisma.invItem.findFirst({
      where: { companyId, enabled: true, [data.matchedField]: { equals: value, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!item) throw new InventoryServiceError('Ese número ya no está registrado. Intenta guardar el item de nuevo.', 404, 'DUPLICATE_GONE');

    const who = proposer.userId ? { proposerUserId: proposer.userId } : { proposerGuestId: proposer.guestId };
    const message = data.message ? data.message.trim() || null : null;
    const pending = await prisma.invChangeProposal.findFirst({ where: { companyId, itemId: item.id, kind: data.kind, status: 'pending', ...who }, select: { id: true } });
    const saved = pending
      ? await prisma.invChangeProposal.update({ where: { id: pending.id }, data: { changes, message, matchedField: data.matchedField, matchedValue: value } })
      : await prisma.invChangeProposal.create({
        data: { companyId, itemId: item.id, kind: data.kind, matchedField: data.matchedField, matchedValue: value, changes, message, proposerLabel: proposer.label.slice(0, 200), ...who },
      });
    return { id: saved.id, status: saved.status };
  }

  async function loadForReviewer(companyId, rows) {
    const itemIds = [...new Set(rows.map((r) => r.itemId))];
    const items = itemIds.length
      ? await prisma.invItem.findMany({
        where: { id: { in: itemIds }, companyId },
        include: {
          category: { select: { name: true } }, brand: { select: { name: true } },
          location: { select: { name: true } }, condition: { select: { name: true } }, area: { select: { name: true } },
        },
      })
      : [];
    return new Map(items.map((i) => [i.id, i]));
  }

  const currentOf = (item, field) => {
    const def = FIELDS[field];
    if (field === 'warrantyExpiry') return { value: iso(item.warrantyExpiry) };
    if (def.relation && RELATION_NAME[def.relation]) return { value: item[field] ?? null, label: item[RELATION_NAME[def.relation]]?.name ?? null };
    return { value: item[field] ?? null };
  };

  const shape = (row, item) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.createdAt,
    proposerLabel: row.proposerLabel,
    message: row.message,
    matched: { field: row.matchedField, value: row.matchedValue },
    decisions: row.decisions ?? {},
    reviewNote: row.reviewNote ?? null,
    item: { id: item.id, name: item.name, assetTag: item.assetTag, serialNumber: item.serialNumber, areaId: item.areaId, areaName: item.areaId ? (item.area?.name ?? null) : 'General' },
    changes: Object.entries(row.changes ?? {}).map(([field, proposed]) => {
      const current = currentOf(item, field);
      return { field, label: FIELDS[field]?.label ?? field, proposed, current, differs: (current.value ?? '') !== (proposed.value ?? '') };
    }),
  });

  // Proposals the caller may review: those on items in areas where it can write.
  async function list({ companyId, scope, status = 'pending', limit = 100 }) {
    const rows = await prisma.invChangeProposal.findMany({ where: { companyId, status }, orderBy: { createdAt: 'asc' }, take: Math.min(Number(limit) || 100, 200) });
    const items = await loadForReviewer(companyId, rows);
    return rows
      .filter((row) => items.has(row.itemId) && canWriteArea(scope, items.get(row.itemId).areaId))
      .map((row) => shape(row, items.get(row.itemId)));
  }

  async function review({ companyId, id, body, scope, actorId = null, actorAuthId = null }) {
    const parsed = reviewSchema.safeParse(body && typeof body === 'object' ? body : {});
    if (!parsed.success) throw new InventoryServiceError('Datos inválidos.', 400, 'INVALID_BODY');
    const proposal = await prisma.invChangeProposal.findFirst({ where: { id, companyId } });
    if (!proposal) throw new InventoryServiceError('Propuesta no encontrada.', 404);
    if (proposal.status !== 'pending') throw new InventoryServiceError('Esta propuesta ya fue revisada.', 409, 'ALREADY_REVIEWED');
    const item = await prisma.invItem.findFirst({ where: { id: proposal.itemId, companyId } });
    if (!item || !canWriteArea(scope, item.areaId)) throw new InventoryServiceError('Propuesta no encontrada.', 404);

    const fields = Object.keys(proposal.changes ?? {});
    const decisions = Object.fromEntries(fields.map((field) => [field, parsed.data.decisions[field] === 'accept' ? 'accept' : 'reject']));
    const accepted = fields.filter((field) => decisions[field] === 'accept');
    if (accepted.length) {
      const patch = Object.fromEntries(accepted.map((field) => [field, proposal.changes[field].value]));
      await inventoryService.updateItem(item.id, patch, companyId, { actorAuthId, scope });
    }
    const status = proposal.kind === 'access_request' ? 'dismissed'
      : accepted.length === 0 ? 'rejected' : accepted.length === fields.length ? 'accepted' : 'partial';
    await prisma.invChangeProposal.update({
      where: { id },
      data: { status, decisions, reviewedById: actorId, reviewedAt: new Date(), reviewNote: parsed.data.note?.trim() || null },
    });
    return { id, status, applied: accepted };
  }

  return { submit, list, review };
}
