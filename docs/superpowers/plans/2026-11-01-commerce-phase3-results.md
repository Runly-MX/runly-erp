# Commerce Recovery — galería y fase 3 técnica POS Tienda

Fecha: 2026-11-01. **Veredicto: APTO para comenzar el frontend POS Tienda.** Se entregan C7 de venta/devolución y las dependencias operativas de fase 3. No se declara implementada ni certificada la experiencia React de Tienda, ni se comienza fase 4.

## Commits y alcance

Base inicial `84290c466`, árbol limpio, rama `main`. El cierre de Catálogo y la galería `a94de57f7` estaban presentes y se conservaron. Se revisaron los contratos del maestro, el plan, la especificación UX y los cierres anteriores contra servicios y pruebas reales; C7 no existía todavía.

Commit de implementación: **`f293f2e2c71b95976384ea91e8ae5315d2c806d8`**, `feat(pos): complete retail receipt and recovery contracts`.

Este informe se incorpora en un commit documental posterior. Su identificador exacto se obtiene con `git log -1 --format=%H -- docs/superpowers/plans/2026-11-01-commerce-phase3-results.md`; el hash final del cierre se entrega junto con la comprobación de árbol limpio. No hay un hash autorreferencial dentro del documento.

Todo el trabajo fue local: sin SSH, push, despliegue, producción ni migraciones sobre una instalación existente. Se usaron contenedores desechables propios y datos sintéticos. No se modificaron pantallas React de POS, galería, `SortableList`, Cocina o Restaurante.

## Etapa A: galería

**17/17 comprobaciones E2E aprobadas** mediante `.e2e/commerce-gallery-phase3.mjs`, derivado del procedimiento de Catálogo existente, adaptando fixtures a claves y revisiones actuales. Ejecutado antes de modificar el backend de fase 3, con todas las migraciones vigentes en ese momento, API y web locales.

Se comprobó carga de varias imágenes, estrella para cambiar portada, reordenamiento por teclado con lectura fresca del orden persistido, y contrato `cover_asset_id` + `images` sin pérdida o duplicación. También se reordenaron atributos con el `SortableList` vertical predeterminado y se verificó su persistencia: el modo grid no rompió ese uso existente. Sin errores de página ni respuestas 5xx.

**Pendiente visual bajo para Claude:** los controles de mover/estrella/quitar en `apps/desktop/src/modules/runly.catalog/components/ProductImageManager.jsx` tienen un área DOM medida de **32 × 32 px** (`h-8 w-8`), con iconos menores. Superan el umbral de 24 px de la comprobación, pero no alcanzan el objetivo táctil de 44 × 44 px de la UX aprobada. Ampliar el área interactiva conservando iconos y composición; no hace falta rediseño. No se certificó dispositivo táctil físico. Este hallazgo no implica pérdida de imágenes ni bloqueo de integridad, por lo que se continuó con la etapa B según la autorización.

## Contratos reales disponibles

Las rutas v2 requieren empresa activa e identidad autorizada. Los errores son `{error:{code,message},requestId}`. Las escrituras conservan `Idempotency-Key` ASCII visible de 16–128 caracteres; misma clave/body devuelve la respuesta persistida, otro body devuelve `IDEMPOTENCY_CONFLICT`. Los importes son cadenas con dos decimales y las cantidades con tres.

| Ruta / SDK `client.commerce` | Contrato y permiso |
|---|---|
| `GET /pos/v2/context` · `context(query,token)` | Selección explícita outletId/terminalId, listas de la empresa, currentSession, moneda, capacidades y operationState. Permisos operativos; `pos.caja.operate` ahora puede consultar el contexto sin administración |
| `GET /pos/v2/sessions/current` · `currentSession(query,token)` | Query obligatoria `{outletId,terminalId}`. `{data:session|null}` tras validar sucursal/terminal activas y relacionadas. `pos.sessions.read` OR `pos.caja.read` OR `pos.caja.operate` |
| `GET /pos/v2/sessions/:id` · `getSession(id,token)` | `{data:{...session,breakdown,frozen,historicalBreakdownUnknown}}`. OPEN calcula desglose del servidor; CLOSED usa el desglose auditado al cierre, sin reconstruirlo con configuración actual. Mismo permiso de lectura |
| `GET /pos/v2/orders` · `listOrders(query,token)` | Filtros outletId, terminalId, experience, status, search, from, to, page, pageSize; máximo 100. `{data,pagination}`. Incluye `receiptId`, `receiptNumber`, `lineCount` y campos financieros anteriores. Lectura de órdenes o Caja, incluido `pos.caja.operate` |
| `GET /pos/v2/orders/:id` · `getOrder(id,token)` | Mantiene OrderDTO y agrega `receipts:[{id,receiptNumber,kind,createdAt}]`, para descubrir comprobantes originales, devoluciones y copias históricas. No carga payloads de impresión en ese resumen |
| `GET /pos/v2/receipts/:id` · `getReceipt(id,token)` | `{data:{...receipt,document,printable,unavailableReason,historicalSnapshotIncomplete,printStatus,printJobs,physicalConfirmationSupported,legacyPrintedCount,confirmedPrintCount}}`. Lectura de órdenes/Caja, sin sesión abierta obligatoria |
| `POST /pos/v2/receipts/:id/print-jobs` · `createPrintJob(id,body,token,{idempotencyKey})` | Body `{transport:"BROWSER"|"BLUETOOTH",reason?}`. `{data:{jobId,receiptId,outletId,transport,status,copy,payload,errorCode,createdAt,finishedAt,physicalConfirmationSupported:false}}`. Mismo permiso de lectura del comprobante |
| `POST /pos/v2/print-jobs/:jobId/result` · `finishPrintJob(jobId,body,token,{idempotencyKey})` | Body `{status:"SUBMITTED"|"FAILED",errorCode?}`. Devuelve PrintJobDTO. Requiere permiso de lectura de órdenes/Caja o `pos.admin.update`, y además ser creador del intento o administrador autorizado |
| `POST /pos/v2/receipts/:id/print-jobs/:jobId/result` | Alias del resultado; valida también la relación de la URL. Una misma clave puede recuperar el resultado mediante ambos paths |

El grupo de lectura de órdenes es `pos.orders.read` OR `pos.caja.read` OR `pos.caja.operate` OR `pos.comandas.read`. La última identidad se conserva por compatibilidad; no se implementó C6. `isAdmin` o `pos.admin.update` permiten la excepción administrativa del resultado, siempre dentro de la misma empresa. Un actor distinto sin esa autorización tampoco puede obtener un replay del resultado usando una clave ajena.

`operationState` es `SELECT_OUTLET`, `SELECT_TERMINAL`, `CONFIGURATION_REQUIRED`, `OPEN_SESSION`, `RECONCILIATION_REQUIRED` o `READY`. No se elige la primera sucursal ni terminal. Se rechazan selecciones guardadas ajenas, deshabilitadas o incompatibles. La API no guarda una selección global compartida: Claude debe conservarla por identidad+empresa y volver a validarla al cambiar contexto. No se añadió un sistema nuevo de asignaciones individuales de terminal; se usa el alcance empresarial y la relación sucursal/terminal del POS existente.

### C7: documento y transporte

El snapshot de un comprobante nuevo se crea dentro de la transacción financiera existente. Conserva payload/order anteriores y agrega `document` y las etiquetas de métodos de pago. No cambia el motor de importes. El documento contiene:

- `schemaVersion:1`, `kind:SALE|REFUND`, `copy`, `refundId` cuando aplica y aviso comercial no CFDI.
- `header`: empresa/nombre, sucursal/nombre, terminal/nombre, folio de comprobante, ID/folio de orden, moneda y fecha. La devolución identifica su terminal de devolución cuando corresponde.
- `lines`: ID de línea/producto/variante, nombre, variantLabel, SKU, cantidad, precio unitario, descuento, subtotal, impuesto y total del snapshot original.
- `payments`: captura original o pago devuelto, método/nombre/tipo, importe, efectivo recibido, cambio y referencia; los valores no demostrables permanecen null.
- `totals`: subtotal, impuesto, total, capturado bruto, devuelto, neto pagado, recibido/cambio cuando son completamente conocidos. No se confunde un anticipo devuelto con una venta nueva; una devolución de anticipo sin líneas conserva subtotal/total del importe devuelto.

Ejemplo de valores comprobados con autenticación real: total `100.00`, captura `100.00`, efectivo recibido `200.00`, cambio `100.00`, moneda `MXN`, folio de comprobante 1. El GET devuelve `printStatus:GENERATED`, cero intentos y `confirmedPrintCount:0` antes de pedir impresión. El render distingue capturado, devuelto y aplicado neto.

`BROWSER` devuelve `{document,contentType:"text/html",html}`. El contenido variable se escapa, sin scripts ni autoimpresión. `BLUETOOTH` devuelve `{document,contentType:"text/plain",encoding:"base64",charset:"US-ASCII",dataBase64}`: texto de 32 columnas, transliteración y eliminación de controles, máximo 2 MiB. No promete logos, corte automático, compatibilidad universal con impresoras o fidelidad de todos los alfabetos.

El SDK agrega **`printDataBytes(payload)`**, que decodifica y valida el payload antes de utilizar el bridge existente. No hay otro bridge Bluetooth. **No pasar dataBase64 directamente como string a `device.bluetooth.print`**, porque el SDK nativo interpreta un string como texto, no como bytes codificados.

### Estados y recuperación de impresión

1. `GENERATED`: documento almacenado, sin intentos nuevos. GET no imprime, no incrementa contadores y no modifica recibos.
2. `QUEUED`: intento persistido con payload, actor y auditoría. Crear el job no envía datos a un dispositivo.
3. `SUBMITTED`: el cliente informa que entregó el intento al transporte o diálogo. **No acredita papel impreso**.
4. `FAILED`: intento finalizado con error; si falta código se guarda `UNKNOWN`. No revierte pago, stock o comprobante.

Sólo se permite QUEUED→SUBMITTED/FAILED; un resultado distinto posterior falla con `INVALID_TRANSITION`. Un replay con su misma clave devuelve el resultado confirmado. `CONFIRMED` desde el cliente se rechaza. `physicalConfirmationSupported:false` y `confirmedPrintCount:0` son explícitos: no existe en esta entrega un protocolo de confirmación física. El `printedCount` anterior se conserva y se expone también como `legacyPrintedCount`, sin utilizarlo como evidencia de hardware.

Un nuevo intento después de cualquier intento previo se marca `copy:true`, incluso si el anterior falló: copia del mismo documento, no prueba de una segunda impresión. Se conserva receiptId y folio; no se crea otra venta, pago o recibo. Los intentos se serializan por comprobante y tienen auditoría transaccional. Si falla auditoría, revierten job/resultado y clave; el pago original permanece intacto.

## Flujo operativo y garantías conservadas

Tienda crea `experience:RETAIL`, `fulfillmentType:TAKEAWAY`, `salesChannel:IN_STORE`, con sucursal, terminal y sesión explícitas. No admite mesa/comensales/asientos y no asigna mesero. No crea tickets ni depende de estaciones de cocina, aunque el producto comparta configuración comercial con restaurante.

Alta y edición de líneas validan la sesión abierta, empresa/sucursal/terminal y moneda. Toman el lock de contenedor antes del de orden, igual que cobro y cierre. Al cerrar la sesión, un borrador existente sigue siendo consultable pero no se edita mediante ese contexto cerrado. El cobro requiere una sesión OPEN explícita de la sucursal y terminal de la orden; nunca deposita dinero en una sesión cerrada ni deriva una venta RETAIL a un turno de mesero. Se valida la moneda de la sesión frente a la configuración al crear y frente a la orden al operar. La regresión de entrega de meseros se mantiene con su contexto de restaurante preexistente, sin añadir capacidades C6.

Se reutilizan los comandos existentes: `createOrder`, `addLine`, `updateLine`, `deleteLine`, `discount`, `addPayment`, `cancel`, `refundPreview`, `refund`, `openSession`, `expectedCash`, `cashMovement`, `closeSession`. No existe un segundo motor de venta. Las líneas congelan precio/impuesto y ahora también `variantLabel`; el historial no se reprecifica al cambiar Catálogo.

C1/C5 siguen siendo la única fuente de vendibles/stock: `sellables`, `categories`, `variants`, `scan`. Buscar o escanear no agrega ni cobra; ambigüedad exige selección. La captura final que lleva la orden a PAID descuenta una vez; los pagos parciales no descuentan ni reservan. Insuficiencia impide la captura y la última unidad concurrente sólo puede venderse una vez. Las devoluciones reponen sólo salidas demostradas y con referencia de reversa, sin fabricar existencias históricas.

Total, precio, impuesto, cantidad devuelta y reparto monetario salen del servidor. Se mantiene deuda100/recibido200/aplicado100/cambio100, separación bruto/devuelto/neto, cancelación protegida, D29 sin efectos, idempotencia persistente y protección de concurrencia. La sesión cerrada conserva corte y desglose auditado; si un cierre histórico carece de ese desglose, devuelve `historicalBreakdownUnknown:true` en vez de reconstruirlo.

### Historial y discrepancias de fase 3

- **D01:** una orden RETAIL OPEN sin pagos puede listarse/recuperarse con `experience`, `terminalId`, outlet y estado. Suspender significa conservar esa orden del servidor; no se crea otro estado o endpoint supuesto. Reanudar su edición exige contexto de sesión válido.
- **D07:** documento estructurado y payload por transporte disponibles para `ReceiptPreview` y `PrintStatus`.
- **D28:** búsqueda exacta por folio numérico de orden o comprobante, con `#` opcional; puede haber más de una coincidencia entre ambos tipos de folio. Filtros de terminal, experiencia y fechas, folio de venta y número de líneas en la proyección. Fechas de calendario usan días UTC, con to inclusivo; timestamps ISO con offset usan límite to exclusivo. Intervalo inválido devuelve 400. Datos y count usan los mismos filtros.
- **D18/D30:** preferencias por terminal e indicador de todas las sesiones siguen siendo opcionales/diferidos. El estado real de la caja seleccionada se obtiene de context/currentSession.
- **D22:** no se añadió preferencia empresarial de conteo ciego. El frontend puede omitir la consulta de esperado hasta terminar el conteo; no necesita inventar importes. La preferencia persistida corresponde a administración posterior.
- Cocina, pre-cuenta y C7 de tickets de cocina pertenecen a fase 4: no se exponen endpoints simulados.

## Ejemplos para Claude

Las variables de clave representan intentos distintos y se conservan al reintentar el mismo body. No generar una nueva clave por cada fallo de red.

```js
const context = (await client.commerce.context({outletId, terminalId}, token)).data;
const session = (await client.commerce.currentSession({outletId, terminalId}, token)).data;
// Si no hay sesión, openSession(..., token, {idempotencyKey: openKey}).
const order = (await client.commerce.createOrder({
  outletId, terminalId, sessionId: session.id,
  experience: 'RETAIL', fulfillmentType: 'TAKEAWAY',
}, token, {idempotencyKey: orderKey})).data;
const cart = (await client.commerce.addLine(order.id, {
  expectedVersion: order.version, productId, variantId, quantity: '1',
}, token, {idempotencyKey: lineKey})).data;
const paid = (await client.commerce.addPayment(order.id, {
  expectedVersion: cart.version, sessionId: session.id, paymentMethodId,
  amount: cart.remainingAmount, tenderedAmount: '200.00',
}, token, {idempotencyKey: paymentKey})).data;
const receipt = (await client.commerce.getReceipt(paid.receiptId, token)).data;
const job = (await client.commerce.createPrintJob(receipt.id, {
  transport: 'BLUETOOTH',
}, token, {idempotencyKey: printKey})).data;
const bytes = client.commerce.printDataBytes(job.payload);
const sent = await device.bluetooth.print(pairedAddress, bytes); // bridge existente
await client.commerce.finishPrintJob(job.jobId, {
  status: sent.ok ? 'SUBMITTED' : 'FAILED',
  ...(sent.ok ? {} : {errorCode: sent.code}),
}, token, {idempotencyKey: printResultKey});
```

Para navegador, utilizar `job.payload.document` o `job.payload.html` con el adaptador autorizado del host. Abrir/cerrar un diálogo o recibir `afterprint` no acredita papel. No mostrar «impreso físicamente» con SUBMITTED.

Se pueden conectar ahora `PosContextGate`, `PosOperationBar`, `SellableGrid`, `VariantPickerSheet`, carrito/edición/descuento, `ChargeSheet`, resultado de venta, historial, `RefundSheet`, apertura/cierre/movimientos, `ReceiptPreview` y `PrintStatus`, mediante esos contratos. Claude implementa sus pantallas aprobadas; este commit no las conecta.

Permisos mínimos de cajero: `pos.access` y `pos.caja.operate`; agregar separadamente `pos.caja.close`, `pos.refunds.create`, `pos.orders.cancel` o `pos.discounts.apply` cuando la función corresponda al rol. No hacen falta permisos de settings, administración, planos o cocina para la venta normal.

Red perdida tras commit: repetir la misma operación, clave y body; conservar el contexto empresarial original. Replay recupera la respuesta original, no un GET actualizado. Después se puede consultar la orden/recibo para conocer el estado presente. Ante `ORDER_VERSION_CONFLICT`, recargar antes de decidir otro intento lógico. Ante `INSUFFICIENT_STOCK`, no mostrar cobro ni inventar una reserva. Ante sesión cerrada, selección inválida o `CURRENCY_MISMATCH`, resolver contexto antes de otra escritura. `REFUND_REQUIRED` exige devolución; `RECONCILIATION_REQUIRED` no se corrige rellenando moneda o stock desde React. No hay cola offline financiera ni canal realtime inventado; se conserva el evento post-commit existente `pos.order.updated` y el refetch por ID.

## Migración y compatibilidad

`20261101230000_pos_receipt_print_jobs` agrega `pos_order_line.variant_label` nullable y `PosPrintJob`. IDs nuevos generados por PostgreSQL. El manifiesto declara propiedad de la tabla. FK/trigger comprueban comprobante/orden/sucursal/empresa, y el intento no puede cambiar identidad, payload, transporte o copia. Hay RLS y revocación de accesos PUBLIC/anon/authenticated.

Un trigger impide actualizar un `PosReceipt`: snapshot y contador anteriores permanecen intactos. La migración no reescribe recibos, pagos, órdenes, sesiones, folios o saldos; se probó conservación del payload y contador de un recibo previo y cero intentos históricos fabricados. No hay borrados ni migración descendente destructiva.

Los snapshots completos anteriores se proyectan en memoria sin consultar precios actuales. También se admite la forma histórica raw de `REPRINT` como copia con su folio existente; no se renumera ni se le atribuye confirmación física. Los incompletos y de moneda desconocida siguen consultables, pero impresión bloqueada con `RECONCILIATION_REQUIRED`. No se inventan nombres, precio, moneda o evidencia de impresión. `variantLabel` de líneas anteriores permanece null si no estaba demostrada.

Se mantienen rutas/datos C0–C5/C8 y firmas SDK existentes. Las nuevas condiciones de RETAIL exigen IDs de contexto y no aceptan asientos/turnos de mesero; escritores antiguos incompatibles reciben error antes de escribir. `activation` informa `phase:3`, `trackedStockSales:true`, `retailBackendReady:true`, **`retailUiReady:false`**. Una reversión segura deshabilita la nueva interfaz/escrituras conservando el esquema y la lectura; no reinstala escritores que ignoren claves, versiones o el libro comercial.

## Evidencia ejecutada

| Verificación | Resultado |
|---|---|
| Galería + regresión de SortableList vertical | **17/17**, navegador con API/web local y PostgreSQL/Supabase desechable; antes de etapa B |
| `node scripts/test-commerce-postgres.mjs` | **171/171**, 30 suites, cero fallos/skips. Incluye diez escenarios PostgreSQL nuevos de fase 3, migración/RLS, C7, las regresiones financieras/stock/tenant de fases anteriores y SDK |
| SDK completo + unitarias Catálogo y brandTheme | **92/92**, cero fallos/skips |
| `.e2e/commerce-retail-phase3-api.mjs` | **22/22** comprobaciones de API HTTP/SDK con autenticación y roles reales en stack desechable; todas las migraciones y web compilada localmente |
| Prisma generate/validate | Correctos |
| ESLint de POS, SDK y pruebas afectadas | Correcto |
| `pnpm check:uuid-policy` | Correcto |
| `pnpm rbac:verify-catalog` | 349 permisos, cero faltantes/sobrantes; no se añadieron grants administrativos |
| `git diff --check` | Correcto |
| `pnpm check:privacy` | Exit 1 por los mismos **67 hallazgos anteriores**, fuera de esta entrega. Los 16 archivos de implementación se revisaron individualmente: cero hallazgos; informe revisado separadamente |

Los procedimientos `.e2e` son utilidades locales ignoradas, reutilizando el stack existente; no se publican datos o endpoints de prueba. El test PostgreSQL y las regresiones SDK quedan versionados en el commit. No se ejecutó navegador POS Tienda, porque su frontend aún no se implementa, ni dispositivo táctil/impresora físicos. La ejecución HTTP autenticada no se presenta como prueba de esas pantallas o hardware. Tampoco se certifica toda la plataforma o una instalación productiva.

| Aceptación solicitada | Evidencia |
|---|---|
| 1 apertura autorizada | Cajero sin administración, context/currentSession y apertura HTTP autenticados; cierre denegado al rol sin close |
| 2–4 simple, variante, escaneo | Venta con producto real y salida comercial; variante fija e identificada; barcode exacto conserva ceros; C1 anterior mantiene búsqueda/paginación |
| 5 cantidad/retirar | Actualización a dos unidades, retiro con total cero, versionado y permisos de descuento; se conserva la prueba anterior de descuento positivo autorizado |
| 6–7 insuficiencia/última unidad | Dos conexiones, cajas y sesiones compiten: una termina, otra INSUFFICIENT_STOCK, sin negativo ni captura adicional |
| 8–10 cambio/retry/respuesta perdida | 100/200/100; pago repetido conserva una captura; orden confirmada con respuesta perdida se recupera con un solo registro |
| 11 cancelación pagada | REFUND_REQUIRED ante anticipo, sin cancelar ni borrar captura |
| 12–13 preview/refund/reversa | D29 sin efectos; devolución parcial con importe del servidor, retorno de una unidad una vez, recibo de devolución y original inmutable |
| 14 cierre | Esperado y contado coinciden; desglose de devolución congelado; HTTP autenticado cierra con diferencia cero |
| 15 aislamiento | Empresa, sucursal, terminal, paths de job/recibo y actor; empresa B vacía rechaza IDs de A; resultado sólo creador/admin autorizado |
| 16 consulta/comprobante | GET sin efectos; HTML escapado; bytes Bluetooth sin controles; retry de intento y resultado, copia mismo folio, impresión fallida no revierte venta; históricos legibles y rollback de auditoría |
| 17 retail sin restaurante | TAKEAWAY/IN_STORE, cero invitados/asientos, sin mesa/mesero ni tickets; cobro retail no deriva a turno de mesero |

## Pendientes y decisión

No se identifican bloqueos críticos o altos de integridad en la base técnica entregada. **APTO para que Claude comience el frontend POS Tienda**, condicionado a consumir los contratos reales y conservar claves/contexto/versiones, sin cálculo monetario autoritativo en React.

Pendientes: área táctil de galería 32→44 px (baja, Claude); certificación de impresoras/transporte en hardware real, incluida confirmación física y alfabetos/layouts específicos (media, validación de integración antes de prometer papel); interfaz Tienda y pruebas de navegador/tablet de ese recorrido (trabajo siguiente de Claude); preferencias opcionales D18/D22/D30 y administración (fase posterior); privacidad global preexistente (fuera de alcance y aún bloquea una publicación). C6, cocina y sus intentos de impresión permanecen en fase 4. No se inició esa fase ni se realizó publicación.
