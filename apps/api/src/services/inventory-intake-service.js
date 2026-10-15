import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createVisionService } from './vision-service.js';
import { prepareVisionImage } from './vision-image.js';
import { createInventoryService, InventoryServiceError } from './inventory-service.js';
import { intakeSchema, observationSchema } from '../routes/inventory/intake-validators.js';
import { createInventoryModelService } from './inventory-model-service.js';
import { EXISTING_ITEM_INCLUDE, diffItemFields } from './inventory-update-diff.js';

const lower = (value) => String(value ?? '').trim().toLocaleLowerCase('es');
const brief = (item) => ({ id: item.id, name: item.name, assetTag: item.assetTag ?? null, serialNumber: item.serialNumber ?? null });
// Fields the AI intake may fill on an existing item (never status, identifiers or custom values).
const COMMON_UPDATE_KEYS = ['model', 'categoryId', 'brandId', 'locationId', 'conditionId', 'description', 'notes', 'vendorName', 'invoiceNumber', 'purchaseDate', 'purchasePrice', 'warrantyExpiry', 'warrantyNotes'];

// The vision model doesn't reliably tag serialNumber under a tight token
// budget (see vision-service.js's DEFAULT_MAX_TOKENS), but rawText transcription
// stays reliable — so also try to pull a serial out of it ourselves whenever
// the model didn't already flag one. Matches the label, not the value, so it
// only fires next to something that actually reads as a serial-number tag;
// the result is always 'uncertain' (a suggestion to confirm, never auto-applied).
const SERIAL_LABEL_RE = /(?:^|[\s,.;:|(])(?:s\s*\/\s*n\.?o?|sn|n\/s|ser(?:ial)?(?:\s*(?:no\.?|number|num\.?|#))?|n[uú]m(?:ero|\.)?\s*de\s*serie|no\.?\s*de\s*serie)\b\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{4,})/i;

function deriveSerialFromRawText(rawText) {
  if (!rawText) return null;
  for (const line of rawText.split(/\r?\n/)) {
    const match = SERIAL_LABEL_RE.exec(line);
    if (match) return match[1];
  }
  return null;
}

export function createInventoryIntakeService({ prisma, env = process.env, vision = createVisionService({ env }), prepareImage = prepareVisionImage }) {
  const buckets = new Map();
  const active = new Set();
  const secret = env.INVENTORY_AI_SIGNING_SECRET || env.GROQ_API_KEY;
  const noopBridge = { logAndPublish: async () => {} };

  function assertContext({ companyId, actorId }) {
    if (!companyId || !actorId) throw new InventoryServiceError('Se requiere una empresa y un usuario autorizado.', 403);
  }
  function hash(value) { return createHash('sha256').update(value).digest('hex'); }
  function sign(value) { return createHmac('sha256', secret).update(`inventory-recognition:${value}`).digest('base64url'); }
  function encodeProof(value) {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${sign(body)}`;
  }
  function decodeProof(proof, context) {
    try {
      if (!secret) throw new Error();
      const [body, signature, extra] = proof.split('.');
      const expected = Buffer.from(sign(body));
      const received = Buffer.from(signature || '');
      if (extra || received.length !== expected.length || !timingSafeEqual(expected, received)) throw new Error();
      const value = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (value.companyId !== context.companyId || value.actorId !== context.actorId || value.expiresAt < Date.now()) throw new Error();
      return value;
    } catch { throw new InventoryServiceError('El reconocimiento venció o no pertenece a esta sesión. Analiza las fotos nuevamente.', 400); }
  }
  async function recognize({ files, ...context }) {
    assertContext(context);
    if (!secret || !env.GROQ_API_KEY) throw new InventoryServiceError('La IA no está configurada. Puedes capturar las series manualmente.', 503);
    if (!files.length || files.length > 3) throw new InventoryServiceError('Selecciona de 1 a 3 fotografías por tanda.', 400);
    if (files.some(f => !/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || f.size > 10 * 1024 * 1024 || !f.size)) {
      throw new InventoryServiceError('Usa fotografías JPEG, PNG, WebP o HEIC de hasta 10 MB.', 400);
    }
    if (files.reduce((sum, f) => sum + f.size, 0) > 30 * 1024 * 1024) throw new InventoryServiceError('La tanda supera 30 MB. Selecciona menos fotografías.', 413);
    const key = `${context.companyId}:${context.actorId}`;
    for (const [id, bucket] of buckets) if (bucket.until < Date.now()) buckets.delete(id);
    const bucket = buckets.get(key) ?? { count: 0, until: Date.now() + 60_000 };
    if (active.has(key) || bucket.count + files.length > 20) throw new InventoryServiceError('Espera a que termine el análisis; el límite es 20 fotos por minuto.', 429);
    bucket.count += files.length;
    buckets.set(key, bucket);
    active.add(key);
    try {
      const images = [];
      // Two images in flight, independent results; one failure preserves the rest.
      for (let offset = 0; offset < files.length; offset += 2) {
        const chunk = await Promise.all(files.slice(offset, offset + 2).map(async (file, localIndex) => {
          const index = offset + localIndex;
          const buf = Buffer.from(await file.arrayBuffer());
          const imageId = hash(buf);
          try {
            const prepared = await prepareImage(buf);
            const result = await vision.extractInventory({ imageBase64: prepared.toString('base64'), mimeType: 'image/jpeg' });
            const source = result.parsed ?? {};
            const rawText = typeof source.rawText === 'string' ? source.rawText.slice(0, 8000) : '';
            const candidates = Array.isArray(source.observations) ? source.observations : [];
            const observations = candidates.slice(0, 100).flatMap(candidate => {
              const parsed = observationSchema.shape.observations.element.safeParse(candidate);
              if (!parsed.success) return [];
              const observation = parsed.data;
              // Regulatory labels can contain a different model than the equipment.
              if (['model', 'partNumber'].includes(observation.field) && /^(?:RMN\b|HSN[-\s]|regulatory\b)/i.test(observation.value ?? '')) observation.field = 'description';
              return [{ ...observation, value: observation.status === 'unreadable' ? null : observation.value }];
            });
            const warnings = Array.isArray(source.warnings) ? source.warnings.filter(w => typeof w === 'string').slice(0, 10).map(w => w.slice(0, 500)) : [];
            if (observations.length !== candidates.length) warnings.push('Algunos campos no se pudieron interpretar. Revisa el texto extraído y completa esos datos manualmente.');
            if (!observations.some(o => o.field === 'serialNumber' && o.value)) {
              const derivedSerial = deriveSerialFromRawText(rawText);
              if (derivedSerial) observations.push({ field: 'serialNumber', value: derivedSerial, status: 'uncertain' });
            }
            if (!observations.length && !rawText) throw new Error('empty-recognition');
            return { index, imageId, name: file.name, rawText, observations, warnings, model: result.model,
              proof: encodeProof({ ...context, imageId, observations, model: result.model, expiresAt: Date.now() + 24 * 60 * 60_000 }) };
          } catch (error) {
            // The user only ever sees the translated `message` below — log the
            // real provider detail so a failure can actually be diagnosed
            // (which model, 401 vs 403 vs 404, quota, etc.) instead of guessing.
            console.error('[inventory-intake] vision recognize failed', { status: error.status, message: error.message });
            const message = error.status === 503 ? 'La IA no está configurada. Puedes completar el equipo manualmente.'
              : /model_not_found|rechazo.*\((?:401|403)\)/i.test(error.message) ? 'El modelo de visión no está disponible con la configuración actual. Revisa el proveedor de IA.'
              : error.status === 429 || /\b429\b/.test(error.message) ? 'El proveedor alcanzó su límite temporal. Espera un momento y reintenta esta foto.'
              : /JSON|empty-recognition/i.test(error.message) ? 'La IA no devolvió una lectura utilizable. Reintenta o toma una foto más cercana de la etiqueta.'
              : /contactar|abort|timeout/i.test(error.message) ? 'El servicio de visión no respondió a tiempo. Reintenta esta foto.'
              : 'No se pudo analizar esta foto. Comprueba el formato y reintenta con la etiqueta enfocada.';
            return { index, imageId, name: file.name, rawText: '', observations: [], warnings: [], error: message };
          }
        }));
        images.push(...chunk);
      }
      return { images };
    } finally { active.delete(key); }
  }

  function parse(input) {
    const parsed = intakeSchema.safeParse(input);
    if (!parsed.success) throw new InventoryServiceError(parsed.error.issues[0]?.message || 'Revisa los datos del lote.', 400);
    return parsed.data;
  }
  async function validate({ input, companyId, actorId, db = prisma }) {
    assertContext({ companyId, actorId });
    const data = parse(input);
    data.common = await createInventoryModelService({ prisma: db }).applyModelDefaults(data.common, companyId);
    const proofs = data.proofs.map(p => decodeProof(p, { companyId, actorId }));
    const imageIds = new Set(proofs.map(p => p.imageId));
    const seenSerials = new Set();
    const seenTags = new Set();
    const issues = [];
    for (const [index, unit] of data.units.entries()) {
      const ids = { serialNumber: unit.serialNumber || null, assetTag: unit.assetTag || null, partNumber: unit.partNumber ?? data.common.partNumber ?? null };
      for (const [field, value] of Object.entries(ids)) {
        if (value && unit.confirmedIdentifiers?.[field] !== value) issues.push({ index, field, message: 'Confirma el identificador antes de guardar.' });
      }
      if (unit.sourceImageIds.some(id => !imageIds.has(id))) issues.push({ index, message: 'Falta el reconocimiento de una fotografía de esta unidad.' });
      if (ids.serialNumber && seenSerials.has(ids.serialNumber)) issues.push({ index, field: 'serialNumber', message: 'La serie está repetida dentro del lote.' });
      if (ids.assetTag && seenTags.has(ids.assetTag)) issues.push({ index, field: 'assetTag', message: 'La etiqueta está repetida dentro del lote.' });
      if (ids.serialNumber) seenSerials.add(ids.serialNumber);
      if (ids.assetTag) seenTags.add(ids.assetTag);
    }
    // Catalog and custom-field IDs are validated independently of the model/client.
    for (const [field, model] of [['categoryId', 'invCategory'], ['brandId', 'invBrand'], ['locationId', 'invLocation']]) {
      if (data.common[field] && !await db[model].findFirst({ where: { id: data.common[field], companyId, enabled: true }, select: { id: true } })) {
        throw new InventoryServiceError('Un catálogo no pertenece a la empresa actual.', 400);
      }
    }
    const definitions = await db.invCustomField.findMany({ where: { companyId, enabled: true,
      OR: [{ categoryId: null }, ...(data.common.categoryId ? [{ categoryId: data.common.categoryId }] : [])] } });
    const values = data.common.customValues ?? [];
    if (new Set(values.map(v => v.fieldId)).size !== values.length || values.some(v => !definitions.some(d => d.id === v.fieldId))) {
      throw new InventoryServiceError('Revisa los campos personalizados de la categoría.', 400);
    }
    if (definitions.some(d => d.required && !values.some(v => v.fieldId === d.id && String(v.value ?? '').trim()))) {
      throw new InventoryServiceError('Completa los campos personalizados obligatorios.', 400);
    }
    // Labels for the incoming catalog values, shown in the side-by-side diff.
    const labels = {};
    for (const [field, model] of [['categoryId', 'invCategory'], ['brandId', 'invBrand'], ['locationId', 'invLocation'], ['conditionId', 'invCondition']]) {
      const id = data.common[field];
      if (id && db[model]) labels[field] = (await db[model].findFirst({ where: { id, companyId }, select: { name: true } }))?.name ?? null;
    }
    const alternatives = [];
    for (const serial of seenSerials) alternatives.push({ serialNumber: { equals: serial, mode: 'insensitive' } });
    for (const tag of seenTags) alternatives.push({ assetTag: { equals: tag, mode: 'insensitive' } });
    // Only ACTIVE items conflict; logically deleted ones never do.
    const matches = alternatives.length ? await db.invItem.findMany({ where: { companyId, enabled: true, OR: alternatives }, include: EXISTING_ITEM_INCLUDE }) : [];
    const updates = [];
    data.units.forEach((unit, index) => {
      const found = new Map();
      if (unit.serialNumber) for (const item of matches) if (lower(item.serialNumber) === lower(unit.serialNumber)) found.set(item.id, { item, by: 'serialNumber' });
      if (unit.assetTag) for (const item of matches) if (lower(item.assetTag) === lower(unit.assetTag) && !found.has(item.id)) found.set(item.id, { item, by: 'assetTag' });
      if (found.size === 0) {
        if (unit.mode !== 'create') issues.push({ index, message: 'Ese equipo ya no existe como activo; vuelve a revisar el lote.' });
        return;
      }
      if (found.size > 1) {
        issues.push({ index, field: 'serialNumber', message: 'La serie y el número de activo pertenecen a equipos distintos. Corrige uno de los dos.', items: [...found.values()].map(f => brief(f.item)) });
        return;
      }
      const [{ item, by }] = found.values();
      const incoming = { name: unit.name ?? data.common.name, partNumber: unit.partNumber ?? data.common.partNumber };
      for (const key of COMMON_UPDATE_KEYS) incoming[key] = { value: data.common[key], label: labels[key] };
      const { changes, patch } = diffItemFields(item, incoming);
      updates.push({ index, matchedBy: by, item: brief(item), changes, patch });
      if (unit.mode === 'create') {
        issues.push({ index, field: by, message: by === 'serialNumber' ? 'Ya existe un equipo activo con esta serie. Actualízalo u omite la unidad.' : 'Ya existe un equipo activo con este número de activo. Actualízalo u omite la unidad.', item: brief(item) });
      } else if (unit.mode === 'update' && unit.existingItemId !== item.id) {
        issues.push({ index, message: 'El equipo a actualizar no coincide con el actual. Vuelve a revisar el lote.' });
      }
    });
    return { data, proofs, issues, updates };
  }

  async function create({ input, companyId, actorId, authUserId }) {
    assertContext({ companyId, actorId });
    const parsed = parse(input);
    const fingerprint = hash(JSON.stringify(parsed));
    try {
      return await prisma.$transaction(async tx => {
        // Serializes intake in this company, including durable idempotency checks.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-intake:${companyId}`}, 0))::text AS locked`;
        const previous = await tx.auditLog.findFirst({ where: { companyId, actorId, moduleKey: 'runly.inventory', action: 'inventory.intake.created',
          metadata: { path: ['key'], equals: parsed.key } } });
        if (previous) {
          if (previous.metadata.fingerprint !== fingerprint) throw new InventoryServiceError('Este lote ya se guardó con otros datos. Abre una captura nueva.', 409);
          return { items: previous.after.items, replayed: true };
        }
        const checked = await validate({ input: parsed, companyId, actorId, db: tx });
        if (checked.issues.length) {
          const err = new InventoryServiceError('Revisa las series, confirmaciones y duplicados del lote.', 409);
          err.issues = checked.issues;
          throw err;
        }
        const transactionalClient = new Proxy(tx, { get(target, prop) {
          if (prop === '$transaction') return fn => fn(tx);
          return target[prop];
        } });
        const service = createInventoryService({ prisma: transactionalClient, activityBridge: noopBridge });
        const items = [];
        for (const [index, unit] of checked.data.units.entries()) {
          const evidence = checked.proofs.filter(p => unit.sourceImageIds.includes(p.imageId)).map(({ imageId, model, observations }) => ({ imageId, model, observations }));
          const plan = checked.updates.find(u => u.index === index);
          if (plan && unit.mode === 'skip') { items.push({ ...plan.item, action: 'skipped' }); continue; }
          if (plan) {
            // Only differing, non-empty fields; identifiers are never touched.
            const saved = Object.keys(plan.patch).length ? await service.updateItem(plan.item.id, plan.patch, companyId, { actorAuthId: authUserId }) : null;
            const item = { id: plan.item.id, name: saved?.name ?? plan.item.name, assetTag: saved?.assetTag ?? plan.item.assetTag, serialNumber: saved?.serialNumber ?? plan.item.serialNumber, action: 'updated' };
            items.push(item);
            await tx.auditLog.create({ data: { companyId, actorId, moduleKey: 'runly.inventory', entityType: 'InvItem', entityId: item.id,
              action: 'inventory.item.updated', before: Object.fromEntries(plan.changes.map(c => [c.field, c.current])), after: Object.fromEntries(plan.changes.map(c => [c.field, c.incoming])),
              metadata: { intakeKey: parsed.key, matchedBy: plan.matchedBy, confirmedIdentifiers: unit.confirmedIdentifiers ?? {}, evidence } } });
            continue;
          }
          const assetTag = unit.assetTag || `INV-${new Date().getFullYear()}-${parsed.key.slice(0, 12)}-${String(index + 1).padStart(3, '0')}`;
          const created = await service.createItem({ ...parsed.common, name: unit.name ?? parsed.common.name, serialNumber: unit.serialNumber || null,
            partNumber: unit.partNumber ?? parsed.common.partNumber, assetTag }, companyId, authUserId);
          const item = { id: created.id, name: created.name, assetTag: created.assetTag, serialNumber: created.serialNumber ?? null, action: 'created' };
          items.push(item);
          await tx.auditLog.create({ data: { companyId, actorId, moduleKey: 'runly.inventory', entityType: 'InvItem', entityId: item.id,
            action: 'inventory.item.created', after: item,
            metadata: { intakeKey: parsed.key, confirmedIdentifiers: unit.confirmedIdentifiers ?? {}, evidence } } });
        }
        await tx.auditLog.create({ data: { companyId, actorId, moduleKey: 'runly.inventory', action: 'inventory.intake.created',
          metadata: { key: parsed.key, fingerprint }, after: { items } } });
        return { items, replayed: false };
      }, { timeout: 30_000 });
    } catch (err) {
      if (err.code === 'P2002') throw new InventoryServiceError('Una etiqueta interna ya existe. Cambia la etiqueta y reintenta.', 409);
      throw err;
    }
  }
  return { recognize, validate, create, isConfigured: () => Boolean(env.GROQ_API_KEY) };
}
