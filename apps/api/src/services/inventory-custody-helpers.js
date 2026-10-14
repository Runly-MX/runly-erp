// Pure helpers for runly.inventory custody records (resguardos): folio,
// status guards, public token, signature decoding, item snapshot, input
// normalization and completion conflict checks. No database access here.
import crypto from 'node:crypto';
import { InventoryServiceError } from './inventory-guards.js';

export const CUSTODY_KINDS = ['DELIVERY', 'RETURN'];
export const CUSTODY_STATUSES = ['DRAFT', 'PENDING_SIGNATURE', 'COMPLETED', 'CANCELLED'];
export const MAX_CUSTODY_ITEMS = 200;
export const MAX_SIGNATURE_BYTES = 300 * 1024;
export const PUBLIC_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RES-2026-0001 for deliveries, DEV-2026-0001 for returns.
export function formatCustodyFolio(kind, year, sequence) {
  const prefix = kind === 'RETURN' ? 'DEV' : 'RES';
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`;
}

// Which statuses each action may start from.
export const CUSTODY_ACTIONS = {
  update: ['DRAFT'],
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
  const raw = String(input ?? '').replace(/^data:image\/png;base64,/i, '').trim();
  if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) throw new InventoryServiceError('La firma no es una imagen PNG válida.', 400);
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length > MAX_SIGNATURE_BYTES) throw new InventoryServiceError('La firma supera 300 KB.', 400);
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new InventoryServiceError('La firma no es una imagen PNG válida.', 400);
  }
  return buffer;
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
    if (!Array.isArray(body.itemIds)) throw new InventoryServiceError('Selecciona al menos un artículo.', 400);
    const ids = [...new Set(body.itemIds.map((id) => optionalUuid(id, 'El artículo')).filter(Boolean))];
    if (!ids.length) throw new InventoryServiceError('Selecciona al menos un artículo.', 400);
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
