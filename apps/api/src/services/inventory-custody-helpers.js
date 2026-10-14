// Pure helpers for runly.inventory custody records (resguardos): folio,
// status guards, public token, signature decoding, item snapshot, input
// normalization and completion conflict checks. No database access here.
import crypto from 'node:crypto';
import { InventoryServiceError } from './inventory-guards.js';
import { SignaturePngError, decodePngSignature } from '../lib/signature-png.js';

export { MAX_SIGNATURE_BYTES } from '../lib/signature-png.js';

export const CUSTODY_KINDS = ['DELIVERY', 'RETURN'];
export const CUSTODY_STATUSES = ['DRAFT', 'PENDING_SIGNATURE', 'COMPLETED', 'CANCELLED'];
export const MAX_CUSTODY_ITEMS = 200;
export const PUBLIC_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RES-2026-0001 for deliveries, DEV-2026-0001 for returns.
export function formatCustodyFolio(kind, year, sequence) {
  const prefix = kind === 'RETURN' ? 'DEV' : 'RES';
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}

// Which statuses each action may start from.
export const CUSTODY_ACTIONS = {
  update: ['DRAFT', 'PENDING_SIGNATURE'],
  sign: ['DRAFT', 'PENDING_SIGNATURE'],
  publicLink: ['DRAFT', 'PENDING_SIGNATURE'],
  preview: ['DRAFT', 'PENDING_SIGNATURE', 'COMPLETED'],
  complete: ['DRAFT', 'PENDING_SIGNATURE'],
  cancel: ['DRAFT', 'PENDING_SIGNATURE', 'COMPLETED'],
};

const STATUS_LABELS = { DRAFT: 'borrador', PENDING_SIGNATURE: 'pendiente de firma', COMPLETED: 'completado', CANCELLED: 'cancelado' };

export function assertCustodyAction(custody, action) {
  const allowed = CUSTODY_ACTIONS[action] ?? [];
  if (!allowed.includes(custody.status)) {
    throw new InventoryServiceError(`El resguardo está ${STATUS_LABELS[custody.status] ?? custody.status}; la acción no está permitida.`, 409);
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function generatePublicToken(now = Date.now(), ttlMs = PUBLIC_TOKEN_TTL_MS) {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), expiresAt: new Date(now + ttlMs) };
}

export function isTokenUsable(custody, now = new Date()) {
  if (!custody?.publicTokenHash || !custody.tokenExpiresAt) return false;
  if (!['DRAFT', 'PENDING_SIGNATURE'].includes(custody.status)) return false;
  return new Date(custody.tokenExpiresAt).getTime() > now.getTime();
}

export function isPlausibleToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(token);
}

// Accepts raw base64 or a data URL; returns the PNG buffer or throws 400.
export function decodeSignaturePng(input) {
  try {
    return decodePngSignature(input);
  } catch (err) {
    if (err instanceof SignaturePngError) throw new InventoryServiceError(err.message, 400);
    throw err;
  }
}

const clip = (value, max) => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? text.slice(0, max) : null;
};

// What the signed document lists for an item; `item` includes category,
// brand and catalogModel names.
export function buildItemSnapshot(item) {
  const typeBrand = [item.category?.name, item.brand?.name].map((v) => (v ? String(v).trim() : '')).filter(Boolean).join(' ');
  return {
    typeBrand: clip(typeBrand, 255),
    model: clip(item.catalogModel?.name ?? item.model, 255),
    serialNumber: clip(item.serialNumber, 255),
    assetTag: clip(item.assetTag, 100),
    invoiceNumber: clip(item.invoiceNumber, 100),
    features: clip(item.description, 2000),
  };
}

function parseDateOnly(value) {
  if (value === undefined || value === null || value === '') return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new InventoryServiceError('La fecha no es válida (usa AAAA-MM-DD).', 400);
  return date;
}

export function todayUtcDate(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const optionalUuid = (value, label) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!UUID.test(String(value))) throw new InventoryServiceError(`${label} no es válido.`, 400);
  return String(value);
};

// Normalizes a create (partial = false) or DRAFT update (partial = true) body.
export function normalizeCustodyInput(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.kind !== undefined) {
    const kind = String(body.kind ?? 'DELIVERY').toUpperCase();
    if (!CUSTODY_KINDS.includes(kind)) throw new InventoryServiceError('El tipo de resguardo no es válido.', 400);
    out.kind = kind;
  }
  if (!partial || body.employeeId !== undefined) {
    const employeeId = optionalUuid(body.employeeId, 'El colaborador');
    if (!employeeId) throw new InventoryServiceError('Selecciona el colaborador.', 400);
    out.employeeId = employeeId;
  }
  if (!partial || body.date !== undefined) out.date = parseDateOnly(body.date) ?? todayUtcDate();
  if (body.comments !== undefined) out.comments = clip(body.comments, 2000);
  if (body.delivererName !== undefined) out.delivererName = clip(body.delivererName, 200);
  const delivererId = optionalUuid(body.delivererId, 'Quien entrega');
  if (delivererId !== undefined) out.delivererId = delivererId;
  const templateId = optionalUuid(body.templateId, 'La plantilla');
  if (templateId !== undefined) out.templateId = templateId;
  if (!partial || body.itemIds !== undefined) {
    // Drafts may start empty; items are required to send the link or complete.
    if (!Array.isArray(body.itemIds)) throw new InventoryServiceError('La lista de artículos no es válida.', 400);
    const ids = [...new Set(body.itemIds.map((id) => optionalUuid(id, 'El artículo')).filter(Boolean))];
    if (ids.length > MAX_CUSTODY_ITEMS) throw new InventoryServiceError(`Un resguardo admite hasta ${MAX_CUSTODY_ITEMS} artículos.`, 400);
    out.itemIds = ids;
  }
  return out;
}

// Returns the Spanish problems that block completing, one per item.
// `items`: InvItem rows (with enabled/adminStatus/assignedToId);
// `activeByItem`: Map itemId -> active assignment ({ employeeId }).
export function completionConflicts({ kind, employeeId, items, itemIds, activeByItem }) {
  const problems = [];
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const id of itemIds) {
    const item = byId.get(id);
    const label = item?.assetTag ? `El artículo ${item.assetTag}` : 'Un artículo';
    if (!item || !item.enabled) { problems.push(`${label} ya no existe.`); continue; }
    const active = activeByItem.get(id);
    if (kind === 'DELIVERY') {
      if (item.adminStatus === 'registration_pending') problems.push(`${label} está pendiente de alta.`);
      else if (item.adminStatus === 'deregistration_proposed') problems.push(`${label} tiene una baja en proceso.`);
      else if (item.adminStatus !== 'registered') problems.push(`${label} está dado de baja.`);
      else if (active && active.employeeId !== employeeId) problems.push(`${label} está asignado a otro colaborador.`);
    } else if (!active || active.employeeId !== employeeId) {
      problems.push(`${label} no está asignado a este colaborador.`);
    }
  }
  return problems;
}

const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

// Which captured signatures a PATCH invalidates (spec §9.4): changing kind,
// employee or items clears both; changing the deliverer clears only the
// deliverer's. Comments, date and template keep them.
// `current`: { kind, employeeId, delivererId, items: [{ itemId }] }.
export function signatureResetFor(current, input) {
  const currentItemIds = (current.items ?? []).map((row) => row.itemId);
  const content = (input.kind !== undefined && input.kind !== current.kind)
    || (input.employeeId !== undefined && input.employeeId !== current.employeeId)
    || (input.itemIds !== undefined && !sameList(input.itemIds, currentItemIds));
  const deliverer = content || (input.delivererId !== undefined && input.delivererId !== current.delivererId);
  return { receiver: content, deliverer };
}

// Choosing someone other than oneself as deliverer requires
// inventory.custody.deliver_on_behalf (spec §9.5).
export function assertDelivererChoice({ actorId, delivererId, canDeliverOnBehalf }) {
  if (delivererId && delivererId !== actorId && !canDeliverOnBehalf) {
    throw new InventoryServiceError('No tienes permiso para generar resguardos a nombre de otra persona.', 403);
  }
}

// Whether `actorId` may apply the saved signature of `ownerId` (spec §9.6):
// always one's own; another user's only with deliver_on_behalf AND that user
// allowing delegation. Returns { allowed, reason } (reason in Spanish).
export function savedSignatureDecision({ actorId, ownerId, canDeliverOnBehalf, allowDelegation }) {
  if (!ownerId) return { allowed: false, reason: 'El resguardo no tiene a un usuario de Runly como quien entrega.' };
  if (ownerId === actorId) return { allowed: true, reason: null };
  if (!canDeliverOnBehalf) return { allowed: false, reason: 'No tienes permiso para firmar a nombre de otra persona.' };
  if (!allowDelegation) return { allowed: false, reason: 'Quien entrega no autorizó que otras personas usen su firma guardada.' };
  return { allowed: true, reason: null };
}

// ── Revision 3: hand-edited snapshot fields (spec §10.2) ───────────────────
// Field -> max length (column size, capped at 500).
export const EDITABLE_SNAPSHOT_FIELDS = {
  typeBrand: 255, model: 255, serialNumber: 255, assetTag: 100, invoiceNumber: 100, features: 500,
};
const FIELD_LABELS = {
  typeBrand: 'Tipo / marca', model: 'Modelo', serialNumber: 'Serie', assetTag: 'Etiqueta', invoiceNumber: 'Factura', features: 'Características',
};

// PATCH item body -> { set: { field: value }, clear: [field] }. A value of
// null or an empty string clears the override (restores the item value).
export function normalizeItemOverrides(body = {}) {
  const set = {};
  const clear = [];
  const source = body && typeof body === 'object' ? body : {};
  for (const key of Object.keys(source)) {
    if (!(key in EDITABLE_SNAPSHOT_FIELDS)) throw new InventoryServiceError(`El campo ${key} no se puede editar.`, 400);
    const value = source[key];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
      throw new InventoryServiceError(`${FIELD_LABELS[key]} no es válido.`, 400);
    }
    const text = value === null ? '' : String(value).trim();
    if (!text) { clear.push(key); continue; }
    if (text.length > EDITABLE_SNAPSHOT_FIELDS[key]) {
      throw new InventoryServiceError(`${FIELD_LABELS[key]} admite hasta ${EDITABLE_SNAPSHOT_FIELDS[key]} caracteres.`, 400);
    }
    set[key] = text;
  }
  if (!Object.keys(set).length && !clear.length) throw new InventoryServiceError('Indica qué campo del artículo cambia.', 400);
  return { set, clear };
}

// Fresh item snapshot with the hand-edited fields of `row` kept.
// `row`: existing InvCustodyItem ({ editedFields, ...snapshot }) or null.
export function mergeSnapshot(fresh, row) {
  const edited = (row?.editedFields ?? []).filter((key) => key in EDITABLE_SNAPSHOT_FIELDS);
  const out = { ...fresh, editedFields: edited };
  for (const key of edited) out[key] = row[key] ?? null;
  return out;
}

// New editedFields list after applying an override patch.
export function nextEditedFields(current = [], { set = {}, clear = [] } = {}) {
  const fields = new Set(current.filter((key) => key in EDITABLE_SNAPSHOT_FIELDS));
  for (const key of Object.keys(set)) fields.add(key);
  for (const key of clear) fields.delete(key);
  return Object.keys(EDITABLE_SNAPSHOT_FIELDS).filter((key) => fields.has(key));
}
