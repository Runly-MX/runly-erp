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
- `label-transports.js`: registro de transportes (`browser`, `file`, `network`, `bluetooth`; ver fase 4). `resolvePrintPlan(printer, registry, { bluetooth })` decide que hace "Imprimir" (PDF en pestana nueva, ZPL descargado, ZPL por Bluetooth). La pestana se abre en el clic (`prepare`) para que el navegador no la bloquee.
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

## Kiosco de escaneo "Escanear" (fase 3)

Plan: `docs/superpowers/plans/2026-10-15-inventory-scan-kiosk.md`.

- API `POST /inventory/scan/resolve` `{ codes: [string] }` (maximo 50, permiso `inventory.item.read`) -> `[{ code, item | null, matchedBy }]` en el mismo orden. Un enlace de Runly (`.../app/p/inv/<token>`) se resuelve con `publicService.itemIdForToken(companyId, token)`: solo tokens activos de la empresa del usuario (revocado o de otra empresa = sin coincidencia). Cualquier otro codigo es coincidencia exacta, recortada y sin distinguir mayusculas con `folio`, `assetTag` o `serialNumber` (en ese orden de prioridad) entre equipos `enabled` de la empresa. `item` trae id, nombre, folio, serie, numero de activo, `status`, `adminStatus`, ubicacion, tipo (categoria), marca y `coverImageFileId`. Servicio `services/inventory-scan-service.js`, rutas `routes/inventory/scan-routes.js`.
- API `POST /inventory/scan/export` `{ columns, rows }` (maximo 2000 filas) -> XLSX con `exceljs` (la misma tabla que el CSV, que se arma en el cliente). SDK `client.inventory.scan.resolve/exportXlsx`.
- Pantalla `InventoryScanScreen.jsx` en `/app/m/runly.inventory/inventory/scan` (navegacion "Escanear", `inventory.item.read`). Escritorio: camara y resultado a la izquierda, lista a la derecha. Telefono: camara plegable arriba, lista debajo y barra fija con conteos y menu Acciones.
- Camara `components/scan/ScanCamera.jsx`: `@zxing/browser` `BrowserMultiFormatReader` continuo (QR, Data Matrix, Code 128/39, EAN, UPC, ITF), camara trasera primero, cambio de camara si hay varias, linterna solo si la pista la soporta (`controls.switchTorch`), permiso nativo `camera` en la app Android via `native.device.requestPermission` (en web/escritorio lo pide `getUserMedia`). El mismo texto leido otra vez en 2,5 s se ignora. No se extrajo un componente compartido con Asistencia: sus lectores (camara frontal, estilo kiosco, solo QR) no cambian.
- Retroalimentacion por lectura: vibracion, sonido (interruptor "Sonido", reutiliza `runly.attendance/kiosk/lib/feedback.js`) y color del recuadro (verde encontrado, ambar repetido, rojo no encontrado; sin animacion con movimiento reducido). Pantalla siempre encendida (Wake Lock) con la camara activa y boton "Pantalla completa".
- Campo de codigo con foco al abrir en equipos con puntero fino, para lectores USB/Bluetooth tipo teclado (Enter envia); en telefono no se enfoca solo.
- Logica pura en `lib/scan-session.js`: normalizacion (quita caracteres de control), extraccion del token, reductor de la sesion (un equipo leido por QR, folio, serie o numero de activo es la misma fila; el repetido se resalta y cuenta lecturas sin llamar a la API), persistencia en `sessionStorage` por empresa (con try/catch), tabla de exportacion y CSV (BOM, CRLF, celdas que empiezan con `= + - @` se neutralizan). Columnas: Folio, Nombre, Serie, Numero de activo, Tipo, Marca, Ubicacion, Estado (alta/baja), Leido a las, Codigo leido.
- "Agregar automaticamente" apagado deja cada lectura en la tarjeta con "Agregar a la lista". Los codigos sin coincidencia quedan como filas "No encontrado".
- Acciones masivas sobre los encontrados: "Imprimir etiquetas" (Etiquetas con `state.labelItems` y `?items=`, maximo 200), "Crear resguardo" (`buildNewCustodyPath({ kind: 'DELIVERY', itemIds })`, abre la hoja Nuevo resguardo con los equipos), "Cambiar estado" (transiciones de alta/baja existentes, `POST /inventory/items/admin-transition/bulk` con `InventoryAdminTransitionDialog`, solo si todos estan en el estado de origen; despues se vuelven a consultar). "Cambiar ubicacion" no existe: no hay API de actualizacion masiva de ubicacion.
- Pruebas: `node --test apps/api/src/services/__tests__/inventory-scan-service.test.js apps/desktop/src/modules/runly.inventory/lib/__tests__/scan-session.test.js`. Verificado en navegador (Chromium con camara simulada mostrando la etiqueta PNG real) en la empresa de pruebas; no probado con una camara fisica, lector USB real ni en el APK.

## Impresion directa (fase 4)

Plan: `docs/superpowers/plans/2026-10-15-inventory-bluetooth-printing.md`.

- **Bluetooth (app Android)**: transporte `bluetooth` en `label-transports.js`. Solo disponible si el host anuncia la capacidad `bluetooth-print` y expone `__RUNLY_DEVICE__.printBluetoothRaw` (hook `hooks/useBluetoothPrinting.js`). "Imprimir" renderiza ZPL (`POST /inventory/labels/render`, `format: 'zpl'`, aunque la impresora diga PDF) y lo envia con `device.bluetooth.print(address, bytes)` del SDK a la MAC guardada en `printer.address`. Antes de enviar pide el permiso `bluetooth` (Android 12+) con `ensureBluetoothReady`. La impresion se registra solo si el envio termino bien. Errores en espanol por codigo (`lib/bluetooth-print.js`: permiso, Bluetooth apagado, no emparejada, no conecta/apagada, tiempo agotado, error de envio). Fuera del APK el boton muestra "Disponible en la app".
- Editor de impresora (`components/labels/PrinterAddressFields.jsx`): en el APK, "Buscar impresoras emparejadas" (lista de `pairedDevices`, sin descubrimiento) llena la direccion, e "Imprimir prueba" envia una etiqueta ZPL pequena (`testLabelZpl`, del tamano del rollo). En web queda el campo manual con una nota. Errores de permiso/emparejamiento ofrecen "Abrir ajustes".
- **Red (IP:9100)**: no se imprime desde el servidor. La API corre en un VPS y no alcanza una impresora en la red local del cliente; abrir sockets a IPs arbitrarias desde el servidor ademas seria un riesgo (SSRF). El transporte `network` descarga `.zpl` (o `.pdf`) y la direccion queda como referencia. Formas recomendadas de imprimir en una Zebra de red:
  1. Descargar `.zpl` y enviarlo desde una computadora de la misma red: Zebra Setup Utilities ("Enviar archivo"), o copia directa al puerto 9100 (por ejemplo `nc 192.168.1.50 9100 < etiquetas.zpl`), o a una cola compartida en modo RAW.
  2. Zebra Browser Print (agente local de Zebra en la computadora): recibe el ZPL desde el navegador y lo envia a la impresora USB/red. Integrarlo en Runly seria una mejora futura (no implementada).
  3. Controlador de Windows/macOS (ZDesigner) e imprimir el PDF al tamano real desde el dialogo del sistema.
- Pruebas: `node --test packages/sdk/src/__tests__/native-device.test.js apps/desktop/src/modules/runly.inventory/lib/__tests__/label-transports.test.js apps/desktop/src/modules/runly.inventory/lib/__tests__/bluetooth-print.test.js`; Rust `cargo test --lib bluetooth_print` (en `apps/desktop/src-tauri`). Kotlin compilado con Gradle (`compileArm64DebugKotlin`). **No probado con una impresora Zebra real ni en un APK instalado.**
