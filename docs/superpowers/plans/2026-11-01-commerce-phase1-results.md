# Runly Commerce Recovery — cierre técnico de fase 1

Fecha: 2026-11-01. Alcance: integridad operativa local. No se ejecutó fase 2.
Normativa: [contrato maestro](../specs/2026-11-01-pos-catalog-recovery-master.md), [plan](./2026-11-01-pos-catalog-recovery.md), [UX](../specs/2026-11-01-pos-catalog-ux.md).

## Estado y control de cambios

Se verificaron los objetos y la presencia en la historia de `33a7c2428` y `1fd80f5d1` antes de modificar código. El árbol estaba limpio. Durante el trabajo otra sesión modificó y confirmó exclusivamente la especificación UX en `27137d995`; esta ejecución no editó ni revirtió ese archivo. No se cambiaron pantallas, hooks, componentes React, estilos, dependencias ni configuración de instalaciones. Se trabajó en `main`, sin ramas/worktrees, SSH, despliegue ni push.

La implementación está disponible como código local y fue ejecutada contra una base PostgreSQL desechable. La migración **no fue aplicada a una instalación existente**. No activar la Caja productiva con clientes antiguos: los escritores seguros requieren versión y clave persistente del intento; los contratos pendientes no tienen endpoints simulados. La fase comercial completa sigue condicionada por el gate de fase 2 del plan.

El commit de esta entrega contiene este informe y exclusivamente los archivos de backend, SDK, migración, fixtures y pruebas descritos aquí. Se identifica en la respuesta de cierre y en la historia Git mediante `feat(pos): implement phase-one commerce integrity`.

## Cambios implementados

- Núcleo de comandos `pos-command-service.js`: transacción, clave por empresa+operación, hash canónico de parámetros/body, respuesta persistida y replay antes de validar la versión. Una clave con otro contenido devuelve `IDEMPOTENCY_CONFLICT`. No expira documentos financieros ni genera otra clave automáticamente.
- Orden de bloqueos contenedor→orden, versión/estado y CAS adicional sobre `paidAmount`; cálculos con Prisma Decimal y redondeo HALF_UP. Comprobantes, auditoría con companyId y respuesta idempotente se confirman junto al dinero. Eventos posteriores al commit no revierten ni aparentan fallar el pago.
- Cobro C3: `amount` aplicado, `tenderedAmount` recibido y `changeAmount` separado. Caso probado: deuda100, recibido200, captura100, cambio100, incremento de caja100. Tarjeta/transferencia no aceptan efectivo y exigen referencia cuando corresponde. La captura de tarjeta es un registro del operador, no procesamiento bancario.
- Cancelación C4: bloquea pagos netos y documentos CAPTURED no conciliados; motivo obligatorio y cambios de orden/mesa/tickets auditados en la transacción. Una mesa se bloquea antes de verificar otras órdenes activas, para no liberarla por una lectura obsoleta.
- Devoluciones C4: documento inmutable con líneas, cantidades, subtotal, impuesto, asignación a capturas y referencia externa. Parciales y totales, anticipo sin líneas y resto de redondeo en último tramo. paidAmount bruto se conserva; refundedAmount/netPaidAmount son independientes. CASH genera una única `REFUND_OUT` en la sesión actual de la misma sucursal; nunca reabre o reduce el corte original. Capturas/líneas no se borran.
- Precios C2: no se admite `unitPrice`, impuestos ni totales enviados por cliente. Producto/variante habilitados, padre correcto, moneda y flags POS se verifican en servidor. Variante obligatoria para VARIABLE; `availableInPos=false` de producto o variante bloquea. Descuento explícito con motivo y permiso nuevo `pos.discounts.apply`; nuevos refunds requieren `pos.refunds.create`. No se conceden esos permisos automáticamente a roles normales.
- C0: contexto real y selección explícita de empresa/sucursal/terminal; sin elección de la primera. Operador consulta sucursales, terminales, configuración operativa y métodos de pago sin `pos.settings.manage`. C3 exige sesión explícita para Caja; cobro sin sesión requiere el permiso de mesero y allowTableCharge, con turno propio.
- C8: aperturas únicas, cierres condicionados y recepción de turnos atómica, con bloqueo común para pago/cierre/movimiento. Cierre no requiere consultar previamente expected-cash; conserva conteo y diferencia. Caja cuenta capturas netas CASH + IN − OUT + WAITER_DELIVERY − REFUND_OUT.
- Cierre de vía alternativa: `sync/push` requiere CRUD de Catálogo para productos/categorías, tanto `runly.catalog` como `atlas.catalog`, e impide cambiar identidad/empresa en payload. Replay de sync valida empresa, módulo, entidad, operación y registro antes de leer/devolver un documento. Esto bloquea eludir precios autorizados o leer otra empresa mediante una clave de sync; no implementa búsqueda ni recuperación funcional de Catálogo.

Los handlers monetarios antiguos se retiraron del router público para que no exista un fallback inseguro. Se conservan las suites anteriores de servicios históricos como regresión, pero la evidencia financiera de esta entrega corresponde al nuevo kernel y sus rutas reales. El router principal monta explícitamente `pos-v2-routes.js` y recibe el middleware empresarial `requireAnyPermission` ya existente.

## Contratos reales disponibles para Claude

Schemas: `apps/api/src/routes/pos/pos-contracts.js`. Fixtures sintéticos validados: `apps/api/src/routes/pos/__fixtures__/commerce-phase1.json`. SDK: `packages/sdk/src/domains/pos-recovery.js`, disponible en **`runly.commerce`**; `runly.pos` permanece como namespace legado. No se generó una API ficticia ni se conectaron pantallas a fixtures.

| Contrato | Endpoints reales de esta etapa | SDK |
|---|---|---|
| C0 | `GET /pos/v2/context?outletId=&terminalId=`, `GET /pos/v2/payment-methods`; lecturas operativas equivalentes legado | `commerce.context(query,token)`, `paymentMethods(token)` |
| C2 | `GET/POST /pos/v2/orders`, `GET /pos/v2/orders/:id`, `POST .../:id/lines`, `PATCH/DELETE .../:id/lines/:lineId`, `POST .../:id/lines/:lineId/discount` | `listOrders`, `getOrder`, `createOrder`, `addLine`, `updateLine`, `deleteLine`, `discount` |
| C3 | `POST /pos/v2/orders/:id/payments` | `addPayment(id,data,token,options)` |
| C4 | `POST /pos/v2/orders/:id/cancel`, `POST .../:id/refunds` | `cancel`, `refund` |
| C8 | `POST /pos/v2/sessions/open`, `GET .../sessions/:id/expected-cash`, `POST .../sessions/:id/close`, `POST .../sessions/:id/cash-movements`, `GET .../waiter-shifts`, `POST .../waiter-shifts/open`, `POST .../waiter-shifts/:id/close` | `openSession`, `expectedCash`, `closeSession`, `cashMovement`, `listWaiterShifts`, `openShift`, `closeShift` |
| C5, fundamento/gate | Columnas de origen/reversa, unicidad de operationKey y conexión transaccional preparada; ventas controladas y reversas con origen conocido bloqueadas hasta fase 2 | No se expone un servicio de saldos/asignación simulado |
| C7, fundamento | Documento SALE/REFUND inmutable y folio único en transacción; printedCount=0 | No se expone impresión/print-jobs como disponible |
| C1/C6 | Pendientes de fases 2/4 | No se anuncian métodos ficticios de vendibles, scan, mesas simples, dispatch o asignaciones de cuenta |

Todas las escrituras SDK reciben `options={idempotencyKey:"<clave estable 16–128 caracteres>"}` como último argumento y usan `onlineOnly:true`. Firma usual `(data,token,options)` o `(id,data,token,options)`; líneas usan `(orderId,lineId,data,token,options)`. Lecturas no requieren clave. Ejemplo:

```js
await runly.commerce.addPayment(order.id, {
  expectedVersion: order.version,
  paymentMethodId,
  sessionId,
  amount: '100.00',
  tenderedAmount: '200.00',
  allocations: [],
}, token, { idempotencyKey: savedAttemptKey })
```

La UI debe conservar **clave y body originales** al reintentar después de timeout; no reutilizar la clave con una versión o formulario editado. Dinero de respuesta tiene dos decimales; cantidad tres. Error v2: `{error:{code,message},requestId}`. El SDK expone `error.code`, `error.status`, `error.requestId` y `error.details`. 409 de versión exige refrescar y confirmar otro intento lógico. Atribuciones `allocations` no vacías se rechazan explícitamente hasta C6; no se aceptan e ignoran.

Lecturas históricas siguen disponibles. Los alias de comandos legados equivalentes usan el mismo kernel y reglas; sin clave responden 428 antes de escribir. No se infiere precio autorizado ni versión a partir de un cliente viejo. Metadata/guests/claim/envío a cocina/reimpresión antiguos y lectura seat-totals responden `CONTRACT_NOT_AVAILABLE` mientras no exista su contrato seguro de integración posterior. Esto es un gate explícito, no un resultado exitoso simulado. Claude debe integrar v2 detrás del gate previsto; no activar las pantallas actuales contra este cambio de forma aislada.

C0 no inventa asignaciones de empleados a sucursales: conserva el alcance empresarial vigente, valida pertenencia y pareja sucursal/terminal y retorna sólo recursos habilitados. Restringir empleados individualmente por sucursal requiere una política persistida posterior, como ya señala el contrato maestro.

## Existencias y compatibilidad histórica

La migración `20261101120000_commerce_recovery_integrity` es aditiva. Mantiene moneda/experiencia/recibido/cambio históricos como desconocidos, sin rellenarlos con la configuración actual. Agrega versión, snapshot fiscal, bruto devuelto, campos de línea, registro de comandos y documentos normalizados de devolución. No toca migraciones aplicadas. Nuevas tablas financieras tienen RLS sin políticas públicas y revocan permisos públicos/anon/authenticated incluso si heredaron grants. El backend debe operar con el rol propietario/autorizado de la instalación; no se verificó ni configuró una instalación real.

Índices parciales impiden dos sesiones OPEN por empresa+terminal y dos turnos OPEN por empresa+sucursal+mesero. Si ya existen duplicados, el preflight SQL aborta **antes del DDL** y no cierra/fusiona filas. Checks NOT VALID preservan históricos incompatibles y aplican a nuevas escrituras. Folios se serializan por empresa y no se fabrican tickets impresos.

Se agregan `outlet_id/source_type/source_id/source_line_id/operation_key/reversal_of_id` al libro comercial existente y unicidad de operación, sin crear saldos alternativos. No se asignan existencias a la primera sucursal ni se reconstruyen salidas de ventas viejas.

**Gate C5 de fase 1:** antes de cualquier captura, incluso anticipo, un artículo controlado devuelve `STOCK_RECOVERY_NOT_READY`. No se registra pago, salida ni decremento. Una devolución sin movimiento de venta conocido no inventa stock; expone `stockRestored:false`. Si hay origen POS_SALE conocido y se solicita restock, la devolución completa se revierte y queda bloqueada hasta el servicio por sucursal de fase 2. Se puede registrar una devolución sin reposición. Los productos no controlados permiten verificar los contratos financieros reales. El stock de bienes de `runly.inventory` nunca se consulta ni modifica.

Órdenes de moneda histórica no demostrable permanecen legibles (`historicalCurrencyUnknown:true`), pero no admiten nuevas operaciones monetarias hasta una conciliación explícita. Esta entrega no inventa un endpoint para conciliarlas masivamente. Los snapshots de precio/impuesto se mantienen aunque cambie Catálogo. Los pagos ya registrados no se borran para «cuadrar» los nuevos saldos.

## Clasificación D01–D25

La tabla fuente de UX enumera 16 discrepancias, no 25 entradas consecutivas. Los nueve IDs no definidos se registran sin inventar requisitos.

| ID | Fase correspondiente | Resolución de esta entrega |
|---|---|---|
| D01 | 3, Tienda | Pendiente: filtros terminalId/experience y suspender/reanudar. No bloquean el kernel. |
| D02 | Sin definición en UX | No se implementa requisito supuesto. |
| D03 | 2, Catálogo | Pendiente búsqueda/admin/barcode/posAvailable; sí se cierra la vía no autorizada de escritura de precio por sync como bloqueo de integridad. |
| D04 | Sin definición en UX | Sin requisito supuesto. |
| D05 | 3, Caja; 5, historial | Pendiente enriquecer listado de cuentas. Detalle conserva table/waiterName y lectura histórica. |
| D06 | 1, notificación de comandos; 4, cocina/mesas | Implementado evento `pos.order.updated` con orderId/action/version después de commit. Canales KDS/mesas y reconexión operativa quedan en fase 4. |
| D07 | 3, C7 | Pendiente payload de presentación/transporte. Hay snapshot comercial inmutable, no diseño de ticket ni impresión física. |
| D08 | Sin definición en UX | Sin requisito supuesto. |
| D09 | Sin definición en UX | Sin requisito supuesto. |
| D10 | 2, disponibilidad; 5, administración | Pendiente proyección por sucursal/baseline. Fase 1 bloquea si producto o variante legacy tienen availableInPos=false. |
| D11 | 5, administración | Contexto lee modo por sucursal real. Se conserva PATCH administrativo existente; no se crea rediseño ni preferencia global nueva. |
| D12 | 4, mesas | Pendiente resumen/filtro Mis mesas. |
| D13 | Sin definición en UX | Sin requisito supuesto. |
| D14 | Sin definición en UX | Sin requisito supuesto. |
| D15 | Sin definición en UX | Sin requisito supuesto. |
| D16 | Sin definición en UX | Sin requisito supuesto. |
| D17 | 1, identidad de movimiento; 2, proyección del libro | Columnas/índices preparados. Listado con origen/folio/actor y saldos queda en fase 2, sin resultados ficticios. |
| D18 | 3, preferencia de terminal | Pendiente; C0 nunca elige experiencia/sucursal por la primera fila. |
| D19 | Sin definición en UX | Sin requisito supuesto. |
| D20 | 4, KDS | Pendiente decidir retrocesos auditados; no se abre una transición financiera terminal desde cocina. |
| D21 | 2, categorías | Pendiente contrato orden de categorías. |
| D22 | 1, C8; 5, preferencia empresarial | Cierre acepta conteo sin preview de expected-cash previo y calcula dentro del lock. Preferencia empresarial de conteo ciego queda fuera de esta fase. |
| D23 | 4, pedir cuenta | Pendiente contrato C6; no se modifica mesa como solución visual. |
| D24 | 3, documentos/impresión | Precuenta fuera de esta etapa. No se llama «impreso» al insertar una fila. |
| D25 | 1, errores; 4, preparación | REFUND_REQUIRED disponible con 409. PREPARATION_STATION_REQUIRED tiene spelling reservado en catálogo estable; no hay endpoint de preparación v2 simulado. |

## Pruebas ejecutadas y casos de aceptación

Ejecutado localmente con Node v22.23.3, pnpm 9.15.0 y PostgreSQL 18 Alpine de imagen ya instalada, sin pulls ni conexiones remotas. `scripts/test-commerce-postgres.mjs` crea un contenedor propio con datos en tmpfs y puerto exclusivamente loopback, genera el esquema previo desde `1fd80f5d1`, aplica la migración nueva, prueba casos históricos/preflight/RLS, ejecuta las suites y detiene únicamente su contenedor. No usa DATABASE_URL de la aplicación ni hace reset de instalaciones.

| Comprobación | Resultado |
|---|---|
| `node scripts/test-commerce-postgres.mjs` | Exit0: 136 tests, 27 suites, 136 pass, fail0, skip0; última ejecución funcional reportó 7524ms. Incluye las 88 pruebas API/manifest anteriores, 7 adaptadores POS, 15 casos PostgreSQL, 3 contratos, 3 SDK Commerce y 20 sync (con regresiones previas). |
| Migración sobre histórico sintético | PASS: importe50, moneda/experiencia/snapshot desconocidos y versión1 preservados; no refunds fabricados. |
| Grants/RLS nuevos | PASS: 4 tablas con RLS y sin grants de lectura/escritura de roles públicos de cliente, aun con default privileges adversariales. |
| Migración con OPEN duplicados | PASS: aborta antes de crear pos_command, conserva las dos sesiones. |
| Todos los archivos `packages/sdk/src/__tests__/*.test.js` | Exit0: 80 tests, 10 suites, pass80, fail0, skip0. Incluye 3 Commerce ya contados arriba; total único entre ambos conjuntos: 213. |
| Prisma validate/generate | Exit0; cliente generado sólo localmente. |
| ESLint de archivos JavaScript modificados/nuevos | Exit0. |
| `pnpm rbac:verify-catalog` | Exit0: 349 permisos en manifiestos, 349 en catálogo, sin faltantes ni extras. |
| `pnpm check:uuid-policy` | Exit0. |
| Preflight de sólo lectura contra fixtures propios | Exit0; 0 grupos OPEN duplicados, 0 contenedores desconocidos y 0 inconsistencias de scope en esos fixtures. No es evidencia de una instalación existente. |
| `pnpm module:checksums` sin argumento | Exit1 por uso: requiere directorio de módulo custom. No aplica a esta migración Prisma core; no se escribió checksum ni se ejecutó --write. |
| `pnpm check:privacy` | Exit1 por los mismos 67 hallazgos basales fuera del alcance. Se verifican además individualmente los archivos de esta entrega; sin hallazgos propios. No se copiaron los valores detectados. |
| `git diff --check` | Sin errores de espacios. |

Aceptación financiera cubierta por PostgreSQL con dos clientes/conexiones independientes: pago100/recibido200/cambio100; retry simultáneo del mismo parcial produce una captura; claves diferentes no cobran dos veces ni sobrepagan; edición/pago conflictivos sólo permiten una versión; anticipo bloquea cancelación hasta devolver; refund parcial/total conserva bruto y última fracción; carreras de refund no exceden captura; devolución a nueva caja no reescribe el corte cerrado; tarjeta no altera efectivo ni acepta cambio; apertura/cierre/pago/corte se serializan; fallo de auditoría revierte captura, orden, recibo y clave, y permite retry seguro. Permisos se prueban contra rutas reales con middleware de identidad de fixture; no se hizo login real de una instalación.

Scope y stock: recursos de otra empresa, sucursal o terminal se rechazan sin pagos; moneda incompatible y VARIABLE sin variante se rechazan; precio cliente no entra; stock controlado y reposición con origen conocido mantienen el gate sin efectos parciales; venta histórica sin movimiento no fabrica reposición. Catálogo no publicado sigue siendo independiente de los controles POS, cuya política completa por sucursal es fase 2.

No se ejecutó el conjunto amplio `user-isolation.integration.test.js` ni migraciones históricas completas de toda la plataforma: la evidencia DB se limita a la migración aditiva sobre el esquema sintético previo, el kernel y las rutas indicadas. No se verificó Supabase Auth/roles de un despliegue, navegador, dispositivo táctil, impresión física ni proveedor bancario. No se mide porcentaje de cobertura de toda la plataforma.

## Pendientes y límite de entrega

Fase 1 entrega el núcleo financiero y contratos reales C0/C2/C3/C4/C8 con compatibilidad de datos y gates de activación. No certifica una experiencia comercial completa. Permanecen para sus fases: C1 vendibles/búsqueda/paginación; C5 asignación y stock por sucursal, movimientos efectivos y reversas de stock; C6 mesas simples, cocina incremental y cuentas atribuidas; C7 print-jobs/hardware; diseño e integración de Claude y conciliación de históricos ambiguos.

El rollback seguro deshabilita escrituras nuevas/legadas incompatibles conservando lectura y documentos; no vuelve a un escritor que ignore refunds/claves/versiones. La expansión de esquema se conserva para conciliación. La aprobación de esta ejecución no autoriza activar fase 2, desplegar ni publicar.
