// /inventory/guest/item-import/* - Excel import for suppliers with the `import` capability. Same endpoints and
// response shapes as the main /inventory/item-import/* so the UI can reuse the import dialog.
import { failGuest } from './guest-shared.js';

export function mountGuestImportRoutes(app, { imports, run }) {
  app.get('/item-import/template', async (c) => {
    try {
      const file = await imports.template(c.get('guestAuth'));
      return c.body(file.buffer, 200, { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"` });
    } catch (err) { return failGuest(c, err, 'No se pudo generar la plantilla.'); }
  });
  app.post('/item-import/parse', run('No se pudo leer el archivo.', async (auth, c) => imports.parse(auth, await c.req.formData())));
  app.post('/item-import/preview', run('No se pudo analizar el archivo.', async (auth, c) => imports.preview(auth, await c.req.json().catch(() => ({})))));
  app.post('/item-import/commit', run('No se pudo importar.', async (auth, c) => imports.commit(auth, await c.req.formData())));
}
