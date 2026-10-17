import { z } from 'zod';
import { readCatalogBytes } from '../services/catalog/catalog-download.js';
import { createFilesService } from '../services/files-service.js';
import { attachmentTargetSchema, normalizeAttachmentTarget, createAttachmentTargets } from './attachment-targets.js';
import { accessFor, liveGrant } from './access.js';
import { createMcpState, digest, transactionClient } from './state.js';
import { fingerprint } from './domain-runtime.js';
import { companyInput, proposalSchema, resultSchema } from './contracts.js';
import { insist } from './config.js';

const MAX_BYTES = 10 * 1024 * 1024;
const fileRef = z.strictObject({ download_url: z.url().max(8192), file_id: z.string().min(1).max(200), mime_type: z.string().max(100).optional(), file_name: z.string().min(1).max(255).optional() });
const refs = z.array(fileRef).min(1).max(5).refine(files => new Set(files.map(file => file.file_id)).size === files.length);
function isSafeXml(buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).trimStart();
    // Stored only; no fiscal recognition, entity resolution or external reads.
    return /^<\?xml\b|^<(?:[A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*(?:\s|>|\/)/.test(text) && !/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet\b|<(?:[\w.-]+:)?(?:svg|html|script|stylesheet|transform)\b/i.test(text);
  } catch { return false; }
}
export const fileImportTools = ['prepare', 'commit'].map(mode => ({
  name: `runly_files_import_${mode}`, moduleKey: 'runly.files', domain: 'files', mode, scope: 'files:write', fileImport: mode,
  description: mode === 'prepare' ? 'Preparar imágenes, PDF o XML originales del chat para un registro existente. Consulta runly_files_query con operation files_attachment_targets y usa target:{type,id}; itemId sigue siendo alias de Inventario. Sin destino guarda archivos privados. Los destinos native aparecen en su módulo; private-reference conserva una referencia privada en Archivos, sin enviar mensajes ni modificar documentos. Usa referencias reales en files; abre approvalUrl antes del commit.' : 'Guardar los originales de una propuesta aprobada en Runly y vincularlos al destino revisado. Reenvía los mismos archivos mediante files; se verifica su SHA-256. No crea otro registro destino. Reintentos devuelven los mismos IDs.',
  inputSchema: z.strictObject({ ...companyInput, files: refs, ...(mode === 'prepare' ? { itemId: z.uuid().optional(), target: attachmentTargetSchema.optional() } : { proposalId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }) }).refine(input => !(input.itemId && input.target), { message: 'Usa target o itemId, no ambos.' }),
  outputSchema: mode === 'prepare' ? proposalSchema : resultSchema,
  operations: [], permission: 'files.assets.create', approvalPolicy: 'web-session-explicit',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  meta: { 'openai/fileParams': ['files'] },
}));

// Public HTTPS only, DNS pinned by the shared downloader. Never persist signed
// URLs, return them to the model, or forward ERP/OpenAI credentials to a host.
export async function readImportFiles(files, download = readCatalogBytes) {
  let total = 0;
  const loaded = [];
  for (const ref of files) {
    const url = new URL(ref.download_url);
    insist(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'file_source_rejected', 'Se requiere una referencia HTTPS de archivo del cliente.', 400);
    let buffer;
    try { ({ buffer } = await download(url.href, { maxBytes: MAX_BYTES, httpsOnly: true })); }
    catch { insist(false, 'file_unavailable', 'No se pudo descargar el original o supera 10 MB. Vuelve a adjuntarlo para obtener una referencia vigente.', 422); }
    total += buffer.length;
    insist(buffer.length > 0 && buffer.length <= MAX_BYTES && total <= 30 * 1024 * 1024, 'file_too_large', 'Máximo 10 MB por archivo y 30 MB por propuesta.', 422);
    const hex = buffer.subarray(0, 12).toString('hex');
    const type = hex.startsWith('89504e470d0a1a0a') ? ['image/png', '.png'] : hex.startsWith('ffd8ff') ? ['image/jpeg', '.jpg'] : /^(GIF87a|GIF89a)/.test(buffer.subarray(0, 6).toString()) ? ['image/gif', '.gif'] : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' ? ['image/webp', '.webp'] : buffer.subarray(0, 5).toString() === '%PDF-' ? ['application/pdf', '.pdf'] : isSafeXml(buffer) ? ['application/xml', '.xml'] : null;
    insist(type, 'file_type_rejected', 'Esta carga admite originales JPEG, PNG, GIF, WebP, PDF y XML UTF-8 sin DTD ni contenido activo. No se convierte ni reconstruye contenido.', 422);
    const declared = ref.mime_type?.toLowerCase() === 'text/xml' ? 'application/xml' : ref.mime_type?.toLowerCase();
    insist(!declared || declared === 'application/octet-stream' || declared === type[0], 'file_type_rejected', 'El tipo declarado no coincide con el original.', 422);
    const name = ref.file_name ?? `${ref.file_id}${type[1]}`;
    insist(!/[\x00-\x1f\x7f/\\]/.test(name) && name !== '.' && name !== '..', 'invalid_filename', 'Nombre de archivo inválido.', 400);
    loaded.push({ buffer, manifest: { fileId: ref.file_id, name, mimeType: type[0], sizeBytes: buffer.length, sha256: digest(buffer) } });
  }
  return loaded.sort((a, b) => a.manifest.fileId.localeCompare(b.manifest.fileId));
}

export function createFileImport({ prisma, config, supabaseAdmin, download }) {
  async function context(auth, companyId, destination, db = prisma) {
    const grant = await liveGrant(auth, db, prisma);
    insist(grant && !grant.payload.revoked && grant.payload.authUserId === auth.authUserId && grant.payload.resource === config.resource, 'invalid_token', 'Conexión revocada.', 401);
    insist(grant.payload.companyIds.includes(companyId), 'company_not_granted', 'Empresa no autorizada.', 403);
    insist(grant.payload.scopes.includes('files:write') && (auth.scopes ?? grant.payload.scopes).includes('files:write'), 'insufficient_scope', 'Reconecta y autoriza files:write.', 403);
    const access = accessFor(auth, db, prisma), a = await access.company(auth.authUserId, companyId, 'files.assets.create');
    insist(a.can('files.assets.read'), 'permission_denied', 'Se requiere permiso de lectura de archivos.', 403);
    await access.module(a, 'runly.files');
    a.mcpScopes = grant.payload.scopes.filter(scope => (auth.scopes ?? grant.payload.scopes).includes(scope));
    const target = await createAttachmentTargets({ prisma: db }).resolve(destination, a);
    return { a, target };
  }
  async function get(id, authUserId, db = prisma) {
    const row = await createMcpState(db).get('proposal', id);
    insist(row?.payload.version === 3 && row.payload.authUserId === authUserId, 'not_found', 'Propuesta no disponible o vencida.', 404);
    return row;
  }
  async function validate(p, db = prisma, scopes, checkRevision = true) {
    const result = await context({ ...p, scopes }, p.companyId, normalizeAttachmentTarget(p.destination, p.itemId), db);
    const snapshot = result.target?.snapshot ?? null;
    // Preserve proposals prepared by the first Inventory-only implementation.
    const comparable = p.destination || !snapshot ? snapshot : { id: snapshot.id, name: snapshot.name, updatedAt: snapshot.updatedAt };
    insist(!checkRevision || p.result || fingerprint(comparable) === fingerprint(p.target), 'proposal_stale', 'El recurso o sus relaciones cambiaron. Prepara otra propuesta.', 409);
    return result;
  }
  const details = (id, row) => {
    const p = row.payload;
    const destination = normalizeAttachmentTarget(p.destination, p.itemId);
    const effect = !destination ? 'Guardar archivos privados sin vincularlos a otro registro.' : p.target.mode === 'private-reference' ? 'Referencia privada en Archivos. No modifica contenido del módulo ni envía mensajes; no aparece como adjunto nativo.' : 'Vincular al registro existente; visible según sus permisos y el panel del módulo.';
    const effects = ['Guardar los originales sin conversión en almacenamiento privado.', effect, ...(destination?.type === 'fleet.driver' ? ['El servicio de Flota puede usar la primera imagen como foto del conductor si no tiene una; conserva su foto existente.'] : [])];
    return { proposalId: id, companyId: p.companyId, moduleKey: 'runly.files', action: 'files.import', preview: { title: destination ? p.target.mode === 'private-reference' ? 'Guardar referencia privada al registro' : 'Adjuntar originales al registro' : 'Guardar originales privados', fields: [{ label: 'Destino', value: p.target ? `${destination.type}: ${p.target.name} (${destination.id})` : 'Mis archivos privados' }, ...p.files.map(file => ({ label: file.name, value: `${file.mimeType} · ${file.sizeBytes} bytes · SHA-256 ${file.sha256}` }))] }, proposed: { files: p.files, destination, target: p.target, effects }, approved: p.approved, rejected: p.rejected, completed: Boolean(p.result), sensitive: false, expiresAt: row.expiresAt };
  };
  async function prepare(args, auth) {
    insist(!(args.target && args.itemId), 'invalid_request', 'Usa target o itemId, no ambos.', 400);
    const destination = normalizeAttachmentTarget(args.target, args.itemId);
    const { target } = await context(auth, args.companyId, destination);
    const loaded = await readImportFiles(args.files, download), files = loaded.map(file => file.manifest);
    const p = { version: 3, authUserId: auth.authUserId, grantId: auth.grantId, companyId: args.companyId, itemId: destination?.type === 'inventory.item' ? destination.id : null, destination, target: target?.snapshot ?? null, files, approved: false, rejected: false };
    const id = Buffer.from(fingerprint(p), 'hex').toString('base64url'), store = createMcpState(prisma);
    let row = await store.get('proposal', id);
    if (!row) {
      await prisma.mcpState.deleteMany({ where: { kind: 'proposal', key: digest(id), expiresAt: { lte: new Date() } } });
      try { row = await store.put('proposal', id, p, 600); }
      catch (error) { if (error.code !== 'P2002') throw error; row = await store.get('proposal', id); }
    }
    const info = details(id, row);
    return { proposalId: id, moduleKey: 'runly.files', operation: 'files.import', status: 'approval_required', preview: info.preview, proposed: info.proposed, expiresIn: 600, approvalUrl: `${config.web}/app/mcp?proposal=${id}` };
  }
  async function proposalInfo(user, id) { const row = await get(id, user); await validate(row.payload); return details(id, row); }
  async function approve(user, id, approved) {
    await prisma.$transaction(async tx => {
      const store = createMcpState(tx), row = await store.lock('proposal', id), p = row.payload;
      insist(p.version === 3 && p.authUserId === user && !p.result && !p.rejected, 'permission_denied', 'Propuesta no disponible.', 403);
      await validate(p, tx);
      await store.save(row, { ...p, approved, rejected: !approved });
    });
    return { approved };
  }
  async function commit(args, auth) {
    const initial = await get(args.proposalId, auth.authUserId), p = initial.payload;
    insist(p.grantId === auth.grantId && p.companyId === args.companyId, 'proposal_mismatch', 'Propuesta no disponible.', 403);
    await validate(p, prisma, auth.scopes);
    if (p.result) return p.result;
    insist(p.approved && !p.rejected, 'approval_required', 'Aprueba la carga en Runly antes de guardar los originales.', 403);
    insist(supabaseAdmin?.storage, 'storage_unavailable', 'Almacenamiento no disponible.', 503);
    const loaded = await readImportFiles(args.files, download);
    insist(fingerprint(loaded.map(file => file.manifest)) === fingerprint(p.files), 'file_changed', 'Los archivos cambiaron. Prepara y aprueba otra propuesta.', 409);
    const uploaded = [];
    // No retries around external storage. Rollback removes only newly uploaded,
    // unreferenced objects. A completed proposal is returned before downloading.
    const storage = { from(bucket) { const real = supabaseAdmin.storage.from(bucket); return { async upload(key, ...rest) { const result = await real.upload(key, ...rest); if (!result.error) uploaded.push({ bucket, key }); return result; } }; } };
    try {
      return await prisma.$transaction(async tx => {
        const db = transactionClient(tx), store = createMcpState(db);
        await store.lock('grant', auth.grantId);
        const row = await store.lock('proposal', args.proposalId), current = row.payload;
        if (current.itemId) {
          // Same order as addItemFile: serialize attachment slots before taking
          // the target row lock (HTTP attachments also acquire FK row locks).
          await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-files:${current.itemId}`}, 0))::text AS locked`;
          await db.$queryRaw`SELECT id FROM inv_item WHERE id = ${current.itemId}::uuid AND company_id = ${current.companyId}::uuid FOR UPDATE`;
        }
        const { a, target } = await validate(current, db, auth.scopes);
        if (current.result) return current.result;
        insist(current.approved && !current.rejected, 'approval_required', 'Propuesta no aprobada.', 403);
        const service = createFilesService({ prisma: db, supabaseAdmin: { storage } }), targets = createAttachmentTargets({ prisma: db });
        const saved = [];
        for (const { buffer, manifest } of loaded) {
          const asset = await service.upload({ authUserId: auth.authUserId, activeContext: { companyId: a.companyId, profileId: a.actorProfileId, isAdmin: a.isAdmin, permissionSet: a.permissionSet }, file: new File([buffer], manifest.name, { type: manifest.mimeType }), fields: { ...targets.fields(target), metadata: { sha256: manifest.sha256, mcpProposalHash: digest(args.proposalId), ...(target ? { mcpTarget: target.spec } : {}) } } });
          await targets.link(target, asset, a);
          saved.push({ id: asset.id, name: asset.originalName, mimeType: asset.mimeType, sizeBytes: Number(asset.sizeBytes), sha256: manifest.sha256 });
        }
        // Domain attachment effects may update their own resource version
        // (e.g. the driver's first image). Recheck authorization after those
        // effects; the approved revision was checked before executing them.
        await validate(current, db, auth.scopes, false);
        const result = { operation: 'files.import', result: { files: saved, itemId: p.itemId, target: target?.spec ?? null, mode: target?.mode ?? 'private', recordLink: target?.link ?? null, link: target?.mode === 'native' ? target.link : `/app/m/runly.files?fileId=${saved[0].id}` } };
        await db.auditLog.create({ data: { companyId: p.companyId, actorId: a.actorProfileId, moduleKey: target?.moduleKey ?? 'runly.files', action: 'mcp.files.import', after: result, metadata: { proposalHash: digest(args.proposalId) } } });
        await store.save(row, { ...current, result });
        return result;
      }, { timeout: 60000 });
    } catch (error) {
      for (const { bucket, key } of uploaded) {
        // A lost commit response must never delete a committed file. If DB
        // verification fails, retain the object for normal orphan maintenance.
        try { if (!await prisma.fileAsset.findFirst({ where: { bucket, objectKey: key }, select: { id: true } })) await supabaseAdmin.storage.from(bucket).remove([key]); } catch { /* no URLs/keys in logs */ }
      }
      throw error;
    }
  }
  return { prepare, commit, proposalInfo, approve };
}
