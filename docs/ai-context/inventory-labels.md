# Etiquetas de Inventario (backend, fase 2)

Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md`. Plan: `docs/superpowers/plans/2026-10-15-inventory-labels-backend.md`. La interfaz React se describe al final.

## Modelo

- Tablas `inv_label_template`, `inv_label_printer`, `inv_label_print` (migracion `20261026000000_inv_label_tables`), por empresa, con borrado suave (`enabled`).
- Cada empresa recibe de forma perezosa tres plantillas (Estandar 60x40, Compacta 50x25, Solo codigo 50x25) la primera vez que lista plantillas. Una sola plantilla (y una sola impresora) puede ser `isDefault`.
- `inv_label_print` es la fuente de verdad de "etiquetado", "ultima impresion" e historial de reimpresiones.

## Render (`apps/api/src/services/inventory-labels/`)

Paquete puro: `layout.js` (validacion, presets, campos, cantidades), `geometry.js` (geometria en mm compartida), `qr-content.js`, `zpl.js` (QR nativo `^BQ`, `^CI28`, `^PQ` por fila), `pdf.js` (pdfkit, una pagina por etiqueta al tamano exacto), `png.js` (SVG a PNG con sharp, solo la primera etiqueta).

Campos disponibles, en orden: `folio`, `name`, `serial`, `model`, `location`, `company`, `assetTag`. Distribuciones: `qr-left`, `qr-top`, `text-only`. Opciones de QR: `errorCorrection` L|M|Q|H, `quietZoneMm`, `contentMode` `url` | `embedded` (`folio|serie|modelo`, puede quedar desactualizado).

Contenido del QR: `<base>/app/p/inv/<token>` (fase 3, ver "Pagina publica"). `createInventoryLabelService` recibe `publicService`, que emite el token perezosamente por equipo antes de renderizar; sin `publicService` se usa el enlace provisional `f-<folio>` (solo pruebas). La base sale de `RUNLY_APP_URL`/`APP_URL`/`PUBLIC_APP_URL`/`WEB_APP_URL` o, si faltan, del origen de la peticion.

## Endpoints y permisos

| Endpoint | Permiso |
|---|---|
| `GET/POST /inventory/label-templates`, `PUT/DELETE /inventory/label-templates/:id` | `inventory.label.read` / `inventory.label.manage` |
| `GET/POST /inventory/label-printers`, `PUT/DELETE /inventory/label-printers/:id` | `inventory.label.read` / `inventory.label.manage` |
| `POST /inventory/labels/render` | `inventory.label.print` |
| `POST /inventory/labels/prints` | `inventory.label.print` |
| `GET /inventory/items/:id/labels` | `inventory.label.read` |
| `GET /inventory/items?labeled=true|false` | `inventory.item.read` |

El listado de items agrega `labelPrintedAt` y `labelPrintCount` (eventos de impresion) solo si el usuario tiene `inventory.label.read`. No existen presets de rol para Inventario en el repositorio; el administrador tiene todo y el resto se otorga desde Identidad.

SDK: `client.inventory.labels.*` (`packages/sdk/src/domains/inventory-labels.js`).

## Verificacion

Pruebas: `node --test apps/api/src/services/__tests__/inventory-labels.test.js apps/api/src/services/__tests__/inventory-label-service.test.js`. No se ha impreso en hardware real ni se ha probado la interfaz.

## Interfaz (runly.inventory)

- Pantalla `InventoryLabelsScreen.jsx` en `/app/m/runly.inventory/inventory/labels` (navegacion "Etiquetas", permiso `inventory.label.read`). Escritorio: tres paneles (cola, vista previa, plantilla e impresora). Telefono: pasos con barra fija inferior (Cola, Vista previa, Ajustes, Imprimir); en Ajustes la vista previa queda fija arriba.
- Componentes en `components/labels/`; logica pura en `lib/label-queue.js` (reductor de la cola, cantidades, enlace `?items=a,b&qty=N`), `lib/label-layout.js` (borrador de plantilla) y `lib/label-transports.js`.
- `label-transports.js`: registro de transportes (`browser`, `file`; `network` y `bluetooth` deshabilitados con "Disponible en la app"). `resolvePrintPlan(printer)` decide que hace "Imprimir" (PDF en pestana nueva, ZPL descargado); la fase 4 registra `bluetooth`/`network` con `labelTransports.register(id, transport)`. La pestana se abre en el clic (`prepare`) para que el navegador no la bloquee.
- La impresion se registra (`POST /inventory/labels/prints`) solo despues de imprimir o descargar PDF/ZPL; la descarga PNG (una etiqueta) no se registra. Reimprimir equipos ya etiquetados pide confirmacion.
- Lista de Inventario: accion masiva "Imprimir etiquetas" (lleva la seleccion en `location.state.labelItems` y en `?items=`), columna "Etiqueta" (con `inventory.label.read`) y filtro "Etiqueta: Sin etiquetar" (`labeled=false`).
- Ficha del equipo: seccion "Etiqueta / QR" (`runly.inventory:LabelSection`, visible con `inventory.label.read` via `canReadLabels`), con QR, estado, Imprimir/Reimprimir y "Ver con detalles" (QR grande, enlace, historial). El enlace mostrado es el publico real (`GET /inventory/items/:id/public-link`); con `inventory.label.manage` aparece "Revocar enlace" (ConfirmDialog).
- Pruebas: `node --test apps/desktop/src/modules/runly.inventory/lib/__tests__/label-queue.test.js apps/desktop/src/modules/runly.inventory/lib/__tests__/label-transports.test.js`.

## Pagina publica del equipo (fase 3)

- Tabla `inv_public_token` (migracion `20261027000000_inv_public_token`): una fila activa por equipo (indice unico parcial `revoked_at IS NULL`), `nonce`, `token_hash` (sha256), `revoked_at`. El token es `HMAC-SHA256(secreto, nonce)` en base64url (43 caracteres); la base solo guarda nonce y hash, y el QR se puede volver a renderizar. Secreto: `INV_PUBLIC_TOKEN_SECRET` o, si falta, `JWT_SECRET`. Cambiar el secreto invalida todos los enlaces.
- Servicio `services/inventory-public-service.js`: `ensureToken`, `ensureTokens`, `revoke` (el siguiente `ensureToken` emite uno nuevo), `revokeAll`, `resolve(token)`, `getSettings/updateSettings`.
- Ajustes por empresa en `InstanceConfig` (clave `inventory.public_page.<companyId>`): `showPhoto`, `showStatus`, `showLocation` (activos) y `showSerial`, `showHolder`, `showCosts` (ocultos por defecto). Nombre, folio y empresa siempre se muestran. `resolve` devuelve solo los campos permitidos.
- API publica sin autenticacion: `GET /public/inventory/items/:token` (limite por IP como el resguardo; `Cache-Control: no-store`). Token desconocido, revocado, mal formado o heredado (`f-<folio>`) responde el mismo 404 `Enlace no valido.`. Devuelve `itemId` (UUID, inutil sin sesion) para los botones privados.
- API autenticada: `GET /inventory/items/:id/public-link` (`inventory.label.print`, crea el token si falta), `DELETE` el mismo (`inventory.label.manage`), `POST /inventory/public-links/revoke-all` (manage), `GET/PUT /inventory/public-page-settings` (read / manage).
- Pagina `PublicInventoryItemScreen` en `/app/p/inv/:token`: foto, nombre, folio, estado, ubicacion, empresa; botones "Ver detalles" y "Editar" navegan a `/app/m/runly.inventory/inventory/<id>[/edit]`, y `AppRouteGuard` pide inicio de sesion y regresa. Ajustes en la pantalla Etiquetas, boton "Pagina publica" (manage).
- Las etiquetas impresas en la fase 2 con `/app/p/inv/f-<folio>` ya no funcionan (pagina "Enlace no valido"): deben reimprimirse. Los folios no dan acceso publico.
- Pruebas: `node --test apps/api/src/services/__tests__/inventory-public-service.test.js`. No se ha probado en navegador ni con Supabase real (foto/logo firmados).
