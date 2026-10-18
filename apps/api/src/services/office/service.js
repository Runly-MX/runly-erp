import { createHash, randomBytes } from 'node:crypto';
import { readOfficeConfig } from './config.js';
import { createCollaboraProvider } from './discovery.js';
import { createWopiTokens } from './tokens.js';
import { createOfficeAccess } from './access.js';
import { validateOfficeDocument } from './validate-document.js';
import { OfficeError, lockConflict } from './errors.js';

// onFileAssetSaved({ file, companyId, bytes }): optional best-effort hook run
// after a FileAsset save commits (e.g. runly.lms re-scans certificate tags).
export function createOfficeService({ prisma, supabaseAdmin, env = process.env, fetchImpl, now = Date.now, broadcaster = null, onFileAssetSaved = null }) {
  let config;
  let configurationError;
  try { config = readOfficeConfig(env); } catch (error) { config = { enabled: true }; configurationError = error; }
  const access = createOfficeAccess({ prisma });
  const provider = config.enabled && !configurationError ? createCollaboraProvider({ config, fetchImpl, now }) : null;
  const tokens = provider ? createWopiTokens({ ...config, now }) : null;
  const version = file => String(file.contentRevision);
  const activeLock = file => file.officeLock && new Date(file.officeLockExpiresAt).getTime() > now() ? file.officeLock : '';
  function ensureEnabled() {
    if (!config.enabled) throw new OfficeError('La edición Office está desactivada.', 503, 'office_disabled');
    if (configurationError) throw configurationError;
  }

  // Per-origin adapter. Everything that reads the row uses the same normalised
  // camelCase shape (see office/access.js); only writes and the row lock differ.
  const backends = {
    file_asset: {
      authorize: (args, db) => access.authorize(args, db),
      idKey: 'fileId',
      rowLock: (db, id) => db.$queryRaw`SELECT id FROM file_asset WHERE id = ${id}::uuid FOR UPDATE`,
      setLock: (db, file, lock, expiresAt) => db.fileAsset.update({ where: { id: file.id }, data: {
        officeLock: lock, officeLockExpiresAt: expiresAt, updatedAt: file.updatedAt,
      } }),
      writeVersion: (db, file) => db.fileAssetVersion.create({ data: {
        fileId: file.id, revision: file.contentRevision, bucket: file.bucket, objectKey: file.objectKey,
        originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, checksum: file.checksum,
      } }),
      marker: (db) => db.$executeRaw`SELECT set_config('atlas.office_write', 'true', true)`,
      commit: async (db, file, { objectKey, checksum, sizeBytes }) => {
        const updated = await db.fileAsset.update({ where: { id: file.id }, data: { objectKey, checksum, sizeBytes, contentRevision: { increment: 1 } } });
        return { contentRevision: updated.contentRevision, updatedAt: updated.updatedAt };
      },
      audit: (db, context, action, metadata = {}) => db.auditLog.create({ data: {
        actorId: context.profile.id, moduleKey: 'runly.files', entityType: 'FileAsset', entityId: context.file.id, action,
        metadata: { companyId: context.companyId, ...metadata },
      } }),
      afterCommit: async (context, _saved, bytes) => {
        if (!onFileAssetSaved) return;
        try { await onFileAssetSaved({ file: context.file, companyId: context.companyId, bytes }); }
        catch { /* never fail a committed save */ }
      },
    },
    chat_attachment: {
      authorize: (args, db) => access.authorizeChatAttachment({ authUserId: args.authUserId, attachmentId: args.fileId ?? args.attachmentId, mode: args.mode }, db),
      idKey: 'attachmentId',
      rowLock: (db, id) => db.$queryRaw`SELECT id FROM chat_attachments WHERE id = ${id}::uuid FOR UPDATE`,
      setLock: (db, file, lock, expiresAt) => db.$executeRaw`
        UPDATE chat_attachments
        SET office_lock = ${lock}, office_lock_expires_at = ${expiresAt}
        WHERE id = ${file.id}::uuid
      `,
      writeVersion: (db, file) => db.$executeRaw`
        INSERT INTO chat_attachment_versions
          (attachment_id, revision, bucket, object_key, file_name, mime_type, size_bytes, checksum)
        VALUES
          (${file.id}::uuid, ${file.contentRevision}, ${file.bucket}, ${file.objectKey},
           ${file.originalName}, ${file.mimeType}, ${file.sizeBytes}, ${file.checksum})
      `,
      marker: () => {},
      commit: async (db, file, { objectKey, checksum, sizeBytes }) => {
        const rows = await db.$queryRaw`
          UPDATE chat_attachments
          SET object_key = ${objectKey}, checksum = ${checksum}, size_bytes = ${sizeBytes},
              content_revision = content_revision + 1, updated_at = NOW()
          WHERE id = ${file.id}::uuid
          RETURNING content_revision, updated_at
        `;
        return { contentRevision: rows[0].content_revision, updatedAt: rows[0].updated_at };
      },
      audit: (db, context, action, metadata = {}) => db.auditLog.create({ data: {
        actorId: context.profile.id, moduleKey: 'runly.chat', entityType: 'ChatAttachment', entityId: context.file.id, action,
        metadata: { companyId: context.companyId, conversationId: context.conversationId, ...metadata },
      } }),
      afterCommit: (context, saved) => {
        broadcaster?.broadcastToChannel?.(`chat:conv:${context.conversationId}`, 'attachment_updated', {
          attachmentId: context.file.id, revision: saved.contentRevision,
        });
      },
    },
  };
  const backendFor = source => backends[source] ?? backends.file_asset;

  async function status() {
    return { enabled: config.enabled, available: Boolean(provider && await provider.isAvailable()), provider: 'collabora', ...(configurationError ? { code: 'office_configuration' } : {}) };
  }

  async function createSession({ authUserId, fileId, mode = 'auto', origin, source = 'file_asset' }) {
    ensureEnabled();
    const backend = backendFor(source);
    const hostOrigin = origin ?? config.hostOrigin;
    if (!config.hostOrigins.includes(hostOrigin)) throw new OfficeError('Este origen no está autorizado para abrir Office.', 403, 'forbidden_origin');
    if (!['view', 'edit', 'auto'].includes(mode)) throw new OfficeError('Modo Office inválido.', 400, 'invalid_mode');
    let context = await backend.authorize({ authUserId, fileId, mode: mode === 'auto' ? 'view' : mode });
    if (mode === 'auto') {
      mode = 'view';
      try { context = await backend.authorize({ authUserId, fileId, mode: 'edit' }); mode = 'edit'; }
      catch (error) { if (!(error instanceof OfficeError) || error.status !== 403) throw error; }
    }
    const wopiId = source === 'chat_attachment' ? `chat:${fileId}` : fileId;
    const [editor, token] = await Promise.all([
      provider.createSession({ file: context.file, mode, wopiSrc: `${config.wopiUrl}/wopi/files/${wopiId}` }),
      tokens.issue({ authUserId, fileId, companyId: context.companyId, profileId: context.profile.id, mode, hostOrigin, source }),
    ]);
    await backend.audit(prisma, context, 'office.document.opened', { mode });
    return { ...editor, ...token, fileId, fileName: context.file.originalName, mode };
  }

  async function authenticate({ fileId, token, write = false, source }, db = prisma) {
    ensureEnabled();
    const claims = await tokens.validate(token, fileId);
    const claimSource = claims.source ?? 'file_asset';
    if (claimSource !== (source ?? 'file_asset')) throw new OfficeError('La sesión de Office no corresponde a este recurso.', 401, 'session_expired');
    if (!config.hostOrigins.includes(claims.hostOrigin)) throw new OfficeError('El origen de la sesión ya no está autorizado.', 401, 'session_expired');
    if (write && claims.mode !== 'edit') throw new OfficeError('Esta sesión es de solo lectura.', 403, 'read_only');
    const backend = backendFor(claimSource);
    const context = await backend.authorize({ authUserId: claims.authUserId, fileId, mode: claims.mode, claims }, db);
    return { ...context, claims };
  }

  async function checkFileInfo(request) {
    const { file, profile, companyId, claims } = await authenticate(request);
    return {
      BaseFileName: file.originalName, Size: file.sizeBytes, Version: version(file),
      OwnerId: companyId.replaceAll('-', ''), UserId: profile.id.replaceAll('-', ''), UserFriendlyName: profile.displayName,
      UserCanWrite: claims.mode === 'edit', ReadOnly: claims.mode !== 'edit', SupportsLocks: true, SupportsGetLock: true,
      SupportsExtendedLockLength: true, SupportsUpdate: true, SupportsRename: false, UserCanRename: false,
      UserCanNotWriteRelative: true, PostMessageOrigin: claims.hostOrigin,
      LastModifiedTime: new Date(file.updatedAt).toISOString(),
      EnableOwnerTermination: false,
    };
  }

  async function getFile(request) {
    return readFile(await authenticate(request));
  }

  async function download({ authUserId, fileId }) {
    // Recovery/download remains available when the editor service is disabled.
    return readFile(await access.authorize({ authUserId, fileId, mode: 'view' }), false);
  }

  async function readFile({ file, format }, validate = true) {
    const { data, error } = await supabaseAdmin.storage.from(file.bucket).download(file.objectKey);
    if (error || !data) throw new OfficeError('No se pudo leer el archivo.', 503, 'storage_error');
    if (data.size > (config.maxBytes ?? 10 * 1024 * 1024)) throw new OfficeError('El archivo supera 10 MB.', 413, 'file_too_large');
    const bytes = Buffer.from(await data.arrayBuffer());
    if (validate) await validateOfficeDocument(bytes, format);
    return { bytes, version: version(file), mimeType: file.mimeType, fileName: file.originalName };
  }

  async function withRowLock(source, fileId, fn) {
    return prisma.$transaction(async db => {
      await backendFor(source).rowLock(db, fileId);
      return fn(db);
    }, { timeout: 10000 });
  }

  async function lock(request) {
    const authed = await authenticate({ ...request, write: true });
    const source = authed.source;
    const { operation, lock: requested, oldLock } = request;
    if (!['LOCK', 'GET_LOCK', 'REFRESH_LOCK', 'UNLOCK'].includes(operation)) throw new OfficeError('Operación WOPI no implementada.', 501, 'unsupported_operation');
    if (operation !== 'GET_LOCK' && (typeof requested !== 'string' || !/^[\x20-\x7e]{1,1024}$/.test(requested))) throw new OfficeError('Bloqueo WOPI inválido.', 400, 'invalid_lock');
    if (oldLock !== undefined && (operation !== 'LOCK' || !/^[\x20-\x7e]{1,1024}$/.test(oldLock))) throw new OfficeError('Bloqueo anterior inválido.', 400, 'invalid_lock');
    return withRowLock(source, request.fileId, async db => {
      const { file } = await authenticate({ ...request, write: true }, db);
      const current = activeLock(file);
      if (operation === 'GET_LOCK') return { lock: current };
      if (oldLock !== undefined ? !current || current !== oldLock : (operation === 'LOCK' ? current && current !== requested : !current || current !== requested)) throw lockConflict(current);
      await backendFor(source).setLock(
        db, file,
        operation === 'UNLOCK' ? null : requested,
        operation === 'UNLOCK' ? null : new Date(now() + 30 * 60000),
      );
      return {};
    });
  }

  function requireSaveLock(file, requested) {
    const current = activeLock(file);
    if (!current || current !== requested) throw lockConflict(current);
  }

  async function putFile(request) {
    const context = await authenticate({ ...request, write: true });
    const source = context.source;
    const backend = backendFor(source);
    let objectKey;
    try {
      requireSaveLock(context.file, request.lock);
      if (!request.bytes.length || request.bytes.length > config.maxBytes) throw new OfficeError('Tamaño de archivo inválido.', 413, 'file_too_large');
      await validateOfficeDocument(request.bytes, context.format);
      const checksum = createHash('sha256').update(request.bytes).digest('hex');
      if (request.timestamp && request.timestamp !== new Date(context.file.updatedAt).toISOString()) throw lockConflict(activeLock(context.file));
      if (context.file.checksum === checksum) return { version: version(context.file), lastModifiedTime: new Date(context.file.updatedAt).toISOString() };
      objectKey = `office/${context.companyId}/${context.file.id}/${randomBytes(24).toString('hex')}.${context.format.extension}`;
      const { error } = await supabaseAdmin.storage.from(context.file.bucket).upload(objectKey, request.bytes, { contentType: context.file.mimeType, upsert: false });
      if (error) throw new OfficeError('No se pudo guardar en almacenamiento.', 503, 'storage_error');
      const saved = await withRowLock(source, context.file.id, async db => {
        const current = await authenticate({ ...request, write: true }, db);
        requireSaveLock(current.file, request.lock);
        if (current.file.contentRevision !== context.file.contentRevision || current.file.objectKey !== context.file.objectKey) throw lockConflict(activeLock(current.file));
        await backend.writeVersion(db, current.file);
        await backend.marker(db);
        const committed = await backend.commit(db, current.file, { objectKey, checksum, sizeBytes: request.bytes.length });
        await backend.audit(db, current, 'office.document.saved', { revision: committed.contentRevision, sizeBytes: request.bytes.length });
        return committed;
      });
      await backend.afterCommit(context, saved, request.bytes);
      return { version: String(saved.contentRevision), lastModifiedTime: new Date(saved.updatedAt).toISOString() };
    } catch (error) {
      // Never delete a candidate after an ambiguous commit error: it may already
      // be the live pointer. Unreferenced candidates can be reconciled offline.
      await backend.audit(prisma, context, 'office.document.save_failed', { code: error instanceof OfficeError ? error.code : 'save_error' }).catch(() => {});
      throw error;
    }
  }

  return { status, createSession, authenticate, checkFileInfo, getFile, download, lock, putFile, maxBytes: config.maxBytes ?? 10 * 1024 * 1024 };
}
