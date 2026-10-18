import { Hono } from 'hono';
import { OfficeError } from '../services/office/errors.js';
import { readBoundedBody } from '../services/office/discovery.js';

// requireOfficeAccess: route gate before the per-file check in office/access.js
// (defaults to runly.files read; index.js widens it to LMS permissions).
export function createOfficeRouter({ officeService, authMiddleware, requirePermission, requireOfficeAccess = requirePermission('files.assets.read') }) {
  const router = new Hono();
  const noStore = async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  };
  for (const path of ['/files/office/*', '/files/:id/office/*', '/wopi/*']) router.use(path, noStore);
  router.onError((error, c) => {
    const known = error instanceof OfficeError;
    for (const [key, value] of Object.entries(known ? error.headers : {})) c.header(key, value);
    // Do not log errors containing request URLs, access tokens or Storage URLs.
    return c.json({ error: known ? error.message : 'Error al procesar el documento.', code: known ? error.code : 'office_error' }, known ? error.status : 500);
  });
  router.get('/files/office/status', authMiddleware, requireOfficeAccess, async c => c.json({ data: await officeService.status() }));
  router.get('/files/:id/office/download', authMiddleware, requireOfficeAccess, async c => {
    const file = await officeService.download({ authUserId: c.get('authUserId'), fileId: c.req.param('id') });
    c.header('Content-Type', file.mimeType);
    c.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return c.body(file.bytes);
  });
  router.post('/files/:id/office/session', authMiddleware, requireOfficeAccess, async c => {
    let body;
    try { body = JSON.parse((await readBoundedBody(c.req.raw.body, 2048)).toString('utf8')); } catch (error) {
      if (error instanceof OfficeError) throw error;
      throw new OfficeError('Solicitud de sesión inválida.', 400, 'invalid_request');
    }
    return c.json({ data: await officeService.createSession({ authUserId: c.get('authUserId'), fileId: c.req.param('id'), mode: body.mode ?? 'auto', origin: c.req.header('Origin') }) });
  });
  // `:id` is either a bare FileAsset UUID or `chat:<uuid>` / `chat-<uuid>` for a
  // chat_attachment. Demultiplex here so the token's `source` claim can be
  // cross-checked in the service.
  const request = c => {
    const raw = c.req.param('id');
    const m = /^chat[:-]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(raw);
    return {
      fileId: m ? m[1] : raw,
      source: m ? 'chat_attachment' : 'file_asset',
      token: c.req.query('access_token') ?? c.req.header('Authorization')?.replace(/^Bearer /i, ''),
    };
  };
  router.get('/wopi/files/:id', async c => c.json(await officeService.checkFileInfo(request(c))));
  router.get('/wopi/files/:id/contents', async c => {
    const file = await officeService.getFile(request(c));
    c.header('X-WOPI-ItemVersion', file.version);
    c.header('Content-Type', file.mimeType);
    c.header('Content-Length', String(file.bytes.length));
    return c.body(file.bytes);
  });
  router.post('/wopi/files/:id', async c => {
    const result = await officeService.lock({ ...request(c), operation: c.req.header('X-WOPI-Override'), lock: c.req.header('X-WOPI-Lock'), oldLock: c.req.header('X-WOPI-OldLock') });
    if (result.lock !== undefined) c.header('X-WOPI-Lock', result.lock);
    return c.body(null, 200);
  });
  router.post('/wopi/files/:id/contents', async c => {
    if (c.req.header('X-WOPI-Override') !== 'PUT') throw new OfficeError('Operación WOPI no implementada.', 501, 'unsupported_operation');
    const input = request(c);
    await officeService.authenticate({ ...input, write: true });
    if (Number(c.req.header('Content-Length')) > officeService.maxBytes) throw new OfficeError('El archivo supera 10 MB.', 413, 'file_too_large');
    const bytes = await readBoundedBody(c.req.raw.body, officeService.maxBytes);
    const saved = await officeService.putFile({ ...input, bytes, lock: c.req.header('X-WOPI-Lock'), timestamp: c.req.header('X-COOL-WOPI-Timestamp') ?? c.req.header('X-LOOL-WOPI-Timestamp') });
    c.header('X-WOPI-ItemVersion', saved.version);
    return c.json({ LastModifiedTime: saved.lastModifiedTime });
  });
  return router;
}
