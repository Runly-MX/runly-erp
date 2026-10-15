# Etiquetas de Inventario (backend, fase 2)

Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md`. Plan: `docs/superpowers/plans/2026-10-15-inventory-labels-backend.md`. Este documento cubre solo la API; la interfaz React es otra tarea.

## Modelo

- Tablas `inv_label_template`, `inv_label_printer`, `inv_label_print` (migracion `20261026000000_inv_label_tables`), por empresa, con borrado suave (`enabled`).
- Cada empresa recibe de forma perezosa tres plantillas (Estandar 60x40, Compacta 50x25, Solo codigo 50x25) la primera vez que lista plantillas. Una sola plantilla (y una sola impresora) puede ser `isDefault`.
- `inv_label_print` es la fuente de verdad de "etiquetado", "ultima impresion" e historial de reimpresiones.

## Render (`apps/api/src/services/inventory-labels/`)

Paquete puro: `layout.js` (validacion, presets, campos, cantidades), `geometry.js` (geometria en mm compartida), `qr-content.js`, `zpl.js` (QR nativo `^BQ`, `^CI28`, `^PQ` por fila), `pdf.js` (pdfkit, una pagina por etiqueta al tamano exacto), `png.js` (SVG a PNG con sharp, solo la primera etiqueta).

Campos disponibles, en orden: `folio`, `name`, `serial`, `model`, `location`, `company`, `assetTag`. Distribuciones: `qr-left`, `qr-top`, `text-only`. Opciones de QR: `errorCorrection` L|M|Q|H, `quietZoneMm`, `contentMode` `url` | `embedded` (`folio|serie|modelo`, puede quedar desactualizado).

Contenido del QR: provisional `<base>/app/p/inv/f-<folio>`. La fase 3 inyecta `resolveItemQrUrl(item)` en `createInventoryLabelService` para devolver `<base>/app/p/inv/<token>`; nada mas cambia. La base sale de `RUNLY_APP_URL`/`APP_URL`/`PUBLIC_APP_URL`/`WEB_APP_URL` o, si faltan, del origen de la peticion.

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
