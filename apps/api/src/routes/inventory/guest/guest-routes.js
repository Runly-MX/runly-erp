// /inventory/guest/* - the supplier portal API. Mounted OUTSIDE the normal user-auth middleware (see
// index.js) with its own guest authentication: `Authorization: Guest <session token>`. A guest session is
// accepted only here, and user (Bearer) tokens are rejected here. Everything is scoped to the areas the
// guest is a member of through services/inventory-guest-items.js (same scope semantics as users).
import { Hono } from 'hono';
import { createTokenBucketLimiter } from '../../../lib/token-bucket-limiter.js';
import { failGuest, rateLimit } from './guest-shared.js';
import { GUEST_ENTRY_KINDS } from '../../../services/inventory-guest-catalog.js';
import { mountGuestImportRoutes } from './guest-import-routes.js';

const UNAUTHORIZED = { error: 'Tu sesión expiró. Abre de nuevo el enlace de tu invitación.', code: 'SESSION_INVALID' };

export function createInventoryGuestRouter({
  guestService,
  items,
  limiter = createTokenBucketLimiter({ capacity: 120, refillPerSecond: 2 }),
  imports = null,
}) {
  const app = new Hono();

  app.use('*', rateLimit(limiter));
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const auth = await guestService.authenticate(c.req.header('authorization')).catch(() => null);
    if (!auth) return c.json(UNAUTHORIZED, 401);
    c.set('guestAuth', auth);
    return next();
  });

  const run = (fallback, fn, status = 200) => async (c) => {
    try {
      return c.json({ data: await fn(c.get('guestAuth'), c) }, status);
    } catch (err) {
      return failGuest(c, err, fallback);
    }
  };
  const body = (c) => c.req.json().catch(() => ({}));

  app.get('/me', run('No se pudo cargar tu acceso.', (auth) => items.me(auth)));
  app.post('/session/refresh', run('No se pudo renovar tu sesión.', (auth) => guestService.refresh(auth)));
  app.post('/session/logout', run('No se pudo cerrar tu sesión.', (auth) => guestService.logout(auth)));

  app.get('/catalogs', run('No se pudieron cargar los catálogos.', (auth) => items.catalogs(auth)));

  // Catalogs the item form needs: models (search + create), types, custom fields and catalog entries.
  app.get('/models', run('No se pudieron cargar los modelos.', (auth, c) => items.listModels(auth, c.req.query())));
  app.post('/models', run('No se pudo crear el modelo.', async (auth, c) => items.createModel(auth, await body(c)), 201));
  app.get('/types', run('No se pudieron cargar los tipos.', (auth) => items.listTypes(auth)));
  for (const kind of GUEST_ENTRY_KINDS) {
    app.post(`/${kind}`, run('No se pudo crear en el catálogo.', async (auth, c) => items.createEntry(auth, kind, await body(c)), 201));
  }
  app.get('/custom-fields', run('No se pudieron cargar los campos personalizados.', (auth, c) => items.listCustomFields(auth, c.req.query('categoryId'))));
  app.get('/custom-fields/:id/values', run('No se pudieron cargar las sugerencias.', (auth, c) => items.customFieldValues(auth, c.req.param('id'), c.req.query('search'))));
  app.get('/items/check-identifiers', run('No se pudo comprobar el número.', (auth, c) => items.checkIdentifiers(auth, c.req.query())));
  if (imports) mountGuestImportRoutes(app, { imports, run });

  app.get('/items', async (c) => {
    try {
      return c.json(await items.listItems(c.get('guestAuth'), c.req.query()));
    } catch (err) {
      return failGuest(c, err, 'No se pudieron cargar los items.');
    }
  });
  app.get('/items/:id', run('No se pudo cargar el item.', (auth, c) => items.getItem(auth, c.req.param('id'))));
  app.post('/items', run('No se pudo crear el item.', async (auth, c) => items.createItem(auth, await body(c)), 201));
  app.patch('/items/:id', run('No se pudo actualizar el item.', async (auth, c) => items.updateItem(auth, c.req.param('id'), await body(c))));

  app.post('/items/:id/propose-deregistration', run('No se pudo proponer la baja.', async (auth, c) => items.proposeDeregistration(auth, c.req.param('id'), await body(c))));
  app.get('/items/:id/files', run('No se pudieron cargar los archivos.', (auth, c) => items.listFiles(auth, c.req.param('id'))));
  app.post('/items/:id/files', run('No se pudo subir el archivo.', async (auth, c) => {
    const form = await c.req.parseBody().catch(() => ({}));
    return items.uploadFile(auth, c.req.param('id'), form?.file, typeof form?.label === 'string' ? form.label.slice(0, 100) : null);
  }, 201));
  app.delete('/items/:id/files/:docId', run('No se pudo eliminar el archivo.', (auth, c) => items.deleteFile(auth, c.req.param('id'), c.req.param('docId'))));

  // Anything else under /inventory/guest answers 404 here instead of falling through to the user router.
  app.all('*', (c) => c.json({ error: 'No encontrado.' }, 404));
  return app;
}
