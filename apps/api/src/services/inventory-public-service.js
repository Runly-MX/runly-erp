// inventory-public-service.js — opaque, revocable public link of an item
// (QR `/app/p/inv/<token>`) and the company setting that controls which fields
// the anonymous page may show. The token is HMAC(secret, nonce): the database
// only keeps the nonce and sha256(token), so a database leak alone does not
// yield usable links, yet the QR can be re-rendered on demand.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import { signedUrlWithVariant } from '../lib/image-variants.js';
import { createCompanyBrandService } from './company-brand-service.js';

export const PUBLIC_PAGE_DEFAULTS = Object.freeze({
  showPhoto: true, showStatus: true, showLocation: true, showCosts: false, showHolder: false, showSerial: false,
});
const SETTING_KEYS = Object.keys(PUBLIC_PAGE_DEFAULTS);
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const PHOTO_TTL_SECONDS = 3600;
const settingsKey = (companyId) => `inventory.public_page.${companyId}`;
const notFound = () => new InventoryServiceError('Enlace no válido.', 404);

export const hashPublicToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const isPlausiblePublicToken = (token) => TOKEN_RE.test(String(token ?? ''));

export function createInventoryPublicService({
  prisma, supabaseAdmin = null, secret = process.env.INV_PUBLIC_TOKEN_SECRET || process.env.JWT_SECRET || '', now = () => new Date(),
} = {}) {
  const derive = (nonce) => {
    if (!secret) throw new InventoryServiceError('El servidor no tiene configurado el secreto de enlaces públicos.', 500);
    return createHmac('sha256', secret).update(nonce).digest('base64url');
  };

  // ── Settings ────────────────────────────────────────────────────────────
  async function getSettings(companyId) {
    assertCompany(companyId);
    const row = await prisma.instanceConfig.findUnique({ where: { key: settingsKey(companyId) } });
    let stored = {};
    try { stored = row?.value ? JSON.parse(row.value) : {}; } catch { stored = {}; }
    return Object.fromEntries(SETTING_KEYS.map((key) => [key, typeof stored[key] === 'boolean' ? stored[key] : PUBLIC_PAGE_DEFAULTS[key]]));
  }

  async function updateSettings(companyId, patch = {}) {
    const next = { ...(await getSettings(companyId)) };
    for (const key of SETTING_KEYS) {
      if (patch[key] === undefined) continue;
      if (typeof patch[key] !== 'boolean') throw new InventoryServiceError('Configuración no válida.', 400);
      next[key] = patch[key];
    }
    const value = JSON.stringify(next);
    await prisma.instanceConfig.upsert({
      where: { key: settingsKey(companyId) }, create: { key: settingsKey(companyId), value }, update: { value },
    });
    return next;
  }

  // ── Tokens ──────────────────────────────────────────────────────────────
  async function createToken(companyId, itemId) {
    const nonce = randomBytes(24).toString('base64url');
    const token = derive(nonce);
    try {
      await prisma.invPublicToken.create({ data: { companyId, itemId, nonce, tokenHash: hashPublicToken(token) } });
    } catch (err) {
      // A concurrent request created the active token first (partial unique index).
      const active = await prisma.invPublicToken.findFirst({ where: { companyId, itemId, revokedAt: null } });
      if (active) return derive(active.nonce);
      throw err;
    }
    return token;
  }

  // Lazily creates the item's active token. Items of other companies 404.
  async function ensureToken(companyId, itemId) {
    assertCompany(companyId);
    const item = await prisma.invItem.findFirst({ where: { id: itemId, companyId, enabled: true }, select: { id: true } });
    if (!item) throw new InventoryServiceError('El equipo no existe en la empresa actual.', 404);
    const active = await prisma.invPublicToken.findFirst({ where: { companyId, itemId, revokedAt: null } });
    return active ? derive(active.nonce) : createToken(companyId, itemId);
  }

  // -> Map<itemId, token> for a batch (labels). Unknown/foreign ids are skipped.
  async function ensureTokens(companyId, itemIds) {
    assertCompany(companyId);
    const ids = [...new Set(itemIds.filter(Boolean))];
    const out = new Map();
    if (!ids.length) return out;
    const items = await prisma.invItem.findMany({ where: { companyId, enabled: true, id: { in: ids } }, select: { id: true } });
    const valid = items.map((item) => item.id);
    const active = await prisma.invPublicToken.findMany({ where: { companyId, revokedAt: null, itemId: { in: valid } } });
    for (const row of active) out.set(row.itemId, derive(row.nonce));
    for (const id of valid) if (!out.has(id)) out.set(id, await createToken(companyId, id));
    return out;
  }

  // The previous link stops working; the next ensureToken issues a new one.
  async function revoke(companyId, itemId) {
    assertCompany(companyId);
    const result = await prisma.invPublicToken.updateMany({ where: { companyId, itemId, revokedAt: null }, data: { revokedAt: now() } });
    return { revoked: result?.count ?? 0 };
  }

  async function revokeAll(companyId) {
    assertCompany(companyId);
    const result = await prisma.invPublicToken.updateMany({ where: { companyId, revokedAt: null }, data: { revokedAt: now() } });
    return { revoked: result?.count ?? 0 };
  }

  // ── Anonymous resolution ────────────────────────────────────────────────
  async function coverPhotoUrl(itemId) {
    if (!supabaseAdmin) return null;
    const file = await prisma.invItemFile.findFirst({
      where: { itemId, fileAsset: { enabled: true, mimeType: { startsWith: 'image/' } } },
      orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { fileAsset: { select: { bucket: true, objectKey: true } } },
    });
    const asset = file?.fileAsset;
    return asset ? signedUrlWithVariant(supabaseAdmin, asset.bucket, asset.objectKey, 'card', PHOTO_TTL_SECONDS) : null;
  }

  // Returns ONLY the fields the company allows. Every failure is the same 404.
  async function resolve(token) {
    if (!isPlausiblePublicToken(token)) throw notFound();
    const row = await prisma.invPublicToken.findUnique({ where: { tokenHash: hashPublicToken(token) } });
    if (!row || row.revokedAt) throw notFound();
    const item = await prisma.invItem.findFirst({
      where: { id: row.itemId, companyId: row.companyId, enabled: true },
      select: {
        id: true, folio: true, name: true, status: true, adminStatus: true, serialNumber: true, purchasePrice: true,
        location: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    if (!item) throw notFound();
    const settings = await getSettings(row.companyId);
    const [company, brand, photoUrl] = await Promise.all([
      prisma.company.findUnique({ where: { id: row.companyId }, select: { name: true } }),
      supabaseAdmin ? createCompanyBrandService({ prisma, supabaseAdmin }).getBrandForCompany(row.companyId) : null,
      settings.showPhoto ? coverPhotoUrl(item.id) : null,
    ]);
    const data = {
      itemId: item.id,
      name: item.name,
      folio: item.folio ?? null,
      companyName: company?.name ?? '',
      companyLogoUrl: brand?.logoUrl ?? null,
    };
    if (settings.showPhoto) data.photoUrl = photoUrl;
    if (settings.showStatus) { data.status = item.status; data.adminStatus = item.adminStatus; }
    if (settings.showLocation) data.locationName = item.location?.name ?? null;
    if (settings.showSerial) data.serialNumber = item.serialNumber ?? null;
    if (settings.showCosts) data.purchasePrice = item.purchasePrice == null ? null : String(item.purchasePrice);
    if (settings.showHolder) {
      data.holderName = item.assignedTo ? [item.assignedTo.firstName, item.assignedTo.lastName].filter(Boolean).join(' ') || null : null;
    }
    return data;
  }

  // Authenticated scan lookup: the item id behind an active token of THIS
  // company, else null (unknown, revoked, malformed or another company's).
  async function itemIdForToken(companyId, token) {
    assertCompany(companyId);
    if (!isPlausiblePublicToken(token)) return null;
    const row = await prisma.invPublicToken.findUnique({ where: { tokenHash: hashPublicToken(token) } });
    return row && !row.revokedAt && row.companyId === companyId ? row.itemId : null;
  }

  const urlFor = (baseUrl, token) => `${String(baseUrl ?? '').replace(/\/$/, '')}/app/p/inv/${token}`;

  return { getSettings, updateSettings, ensureToken, ensureTokens, revoke, revokeAll, resolve, itemIdForToken, urlFor };
}
