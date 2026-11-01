# Runly Commerce Recovery — cierre técnico de fase 4

Fecha: 2026-11-01. Alcance: base técnica de POS Restaurante, Comandero, mesas, Cocina y cobro sobre el motor comercial existente. Referencias: [contrato maestro](../specs/2026-11-01-pos-catalog-recovery-master.md), [plan aprobado](2026-11-01-pos-catalog-recovery.md), [UX](../specs/2026-11-01-pos-catalog-ux.md) y [cierre de Tienda](2026-11-01-commerce-pos-retail-integration-results.md).

**APTO para implementar el frontend de Restaurante y Cocina.** No significa que esas pantallas estén implementadas o certificadas. No se modificó React, no se inició fase 5 y no se ejecutó publicación alguna.

## Commits y control del trabajo concurrente

Base inicial: `1d5fe368b`, `main`, árbol limpio. Se verificó la presencia y conservación de `8c1725684`, `cdd4553e9` y sus bases de Tienda/Catálogo. Durante el trabajo otra sesión confirmó documentación/instaladores en `055db405b` y `6e71bbc0a`, fuera de este alcance; se conservaron y no se incluyeron en el commit de Restaurante. No hubo colisión que requiriera aislamiento y se respetó la preferencia del repositorio de trabajar en `main`.

Commit de implementación: **`312394489`**. El commit documental de cierre se identifica con `git log -1 --format=%h -- docs/superpowers/plans/2026-11-01-commerce-phase4-results.md`. Estado de implementación al cierre: confirmado; antes del commit documental sólo este informe estaba pendiente, sin trabajo ajeno sin commit en ese corte.

Se trabajó sólo con código local y bases sintéticas desechables, sin SSH, push, despliegue, base compartida ni datos empresariales reales. La migración no se aplicó a una instalación existente.

## Implementación y servicios

Se conservan `PosOrder`, `PosOrderLine`, pagos, sesiones, turnos, comprobantes, devoluciones, Catálogo y libro comercial. Restaurante no tiene otro sistema financiero, otro maestro de productos ni subórdenes para dividir una cuenta.

- `pos-restaurant-service.js`: directorio de mesas sin plano, creación/configuración versionada, resumen de cuenta, Mis mesas, datos operativos/comensales, reasignación autorizada, Pedir cuenta y atención de reservas mediante el mismo comando de creación de orden.
- `pos-preparation-service.js`: envíos incrementales transaccionales, snapshots, secuencia de extras, KDS con lectura por lotes y paginación, consulta por ID, cambios versionados, deshacer restringido y anulación de preparación auditada.
- `pos-allocations-service.js`: atribuciones de capturas a partidas, saldos por comensal, pagos generales explícitos, reatribución auditada y reducción de atribuciones al devolver.
- `pos-kitchen-print-service.js`: intentos de impresión de comandas sobre `PosPrintJob`, con payload congelado, copia, HTML escapado y bytes ASCII para los transportes existentes. No registra papel confirmado.
- Núcleo existente: `pos-recovery-service`, `pos-recovery-orders`, `pos-recovery-store`, `pos-payment-service`, `pos-refund-service`, `pos-receipt-service`, `pos-v2-routes` y `pos-contracts`. Conservan transacción, CAS, importes Decimal, auditoría y respuesta idempotente compartidos.
- Compatibilidad: `pos-scope-service` admite mesa simple o de plano; reservas se serializan con mesa/atención y auditan en la transacción; configurar estaciones valida empresa/sucursal. El manifiesto declara propiedad de las dos tablas nuevas.

Todos los servicios nuevos se construyen dentro de su factory. Las identidades de entidad las produce PostgreSQL; una clave de intento es texto de transporte, no un UUID de entidad generado por el cliente.

## Contratos reales para Claude

Código de esquemas: `apps/api/src/routes/pos/pos-contracts.js`. SDK: `packages/sdk/src/domains/pos-recovery.js`, namespace **`runly.commerce`**. Fixtures ejecutables: `apps/api/src/routes/pos/__fixtures__/commerce-phase4.json`, validados por `pos-restaurant-contracts.test.js`. Los IDs del JSON son ejemplos sintéticos; las pruebas funcionales crean sus registros con identidades de la base.

Todas las rutas siguientes requieren identidad y empresa activa. No se recibe `companyId` en el body. Importes: cadenas de dos decimales; cantidades: cadenas de tres en los DTO; timestamps: ISO 8601. Las escrituras exigen `Idempotency-Key` visible de 16–128 caracteres; el SDK exige `options={idempotencyKey}` y establece `onlineOnly:true`. Nunca genera otra clave al reintentar ni encola ventas sin conexión.

Permisos de referencia: lectura de órdenes = OR de `pos.orders.read`, `pos.caja.read`, `pos.caja.operate`, `pos.comandas.read`; edición = OR de `pos.orders.update`, `pos.caja.operate`, `pos.comandas.create`; lectura de Cocina = OR de `pos.stations.read`, `pos.cocina.read`, `pos.cocina.operate`, `pos.stations.manage`. Se mantiene la excepción administrativa existente y no se añadieron concesiones automáticas.

| Contrato / ruta real | SDK / contenido y autorización |
|---|---|
| C0 `GET /pos/v2/context` | `context({outletId?,terminalId?},token)`. Conserva el contexto de Caja. Agrega `restaurantOperationState`, `preparation` y capacidades `takeOrders`/`tableCharge`; seleccionar sólo sucursal permite tomar pedidos sin terminal ni sesión |
| C6 `GET /pos/v2/tables?outletId=&myTablesOnly=true` | `tables(query,token)`. Sucursal obligatoria, sin primera selección implícita. Mesa, capacidad, estado, versión, floorId nullable, activeOrderId(s), reconciliationRequired y `activeOrder` con totalAmount, guestCount, openedAt, waiterId, waiterName, readyLineCount. Lectura de órdenes/Comandero o floor.read |
| C6 `POST /pos/v2/tables` | `createTable(body,token,options)`, `{outletId,name,capacity}`; sin piso oculto. `pos.floor.manage` OR `pos.admin.update` |
| C6 `PATCH /pos/v2/tables/:id` | `updateTable(id,body,token,options)`, `{expectedVersion,name?,capacity?,enabled?,status?}`. No libera/deshabilita una mesa con cuenta activa. Mismo permiso administrativo |
| C2 `POST /pos/v2/orders` y líneas | Firmas existentes `createOrder`, `addLine`, `updateLine`, `deleteLine`, `discount`. Restaurante admite DINE_IN, TAKEAWAY, PICKUP y DELIVERY; no requiere caja propia. DINE_IN puede usar mesa simple. Producto, variante, modificadores, precio, impuesto, canal y sucursal se validan en servidor |
| C6 `PATCH /pos/v2/orders/:id/restaurant` | `updateRestaurantOrder`. `{expectedVersion,guestCount?,notes?,waiterId?}`. Conserva IDs de comensales y sólo amplía su número; no borra históricos. Reasignar a otro usuario exige orders.update/admin.update y pertenencia válida a la empresa |
| C6 `POST /pos/v2/orders/:id/request-bill` | `requestBill(id,{expectedVersion},token,options)`. Marca BILL_REQUESTED en la mesa activa, incrementa versión y audita. Permiso de edición; no mueve dinero |
| C1 `GET /pos/v2/sellables/:id/modifiers` | `modifiers(id,token)` devuelve grupos/opciones habilitados, requisitos y precios del Catálogo real. Lectura de órdenes/Comandero; no exige administrar modificadores |
| C6 `GET /pos/v2/stations?outletId=` | `stations(query,token)`, sólo estaciones habilitadas de esa empresa/sucursal. Lectura de Cocina o Comandero |
| C6 `POST /pos/v2/orders/:id/kitchen-dispatches` | `dispatchKitchen`. `{expectedVersion,lineIds}` → dispatchId, dispatchSequence, dispatchedAt, tickets con stationId/lineIds, skippedLineIds, manual y orden actualizada. Permiso de edición |
| C6 `GET /pos/v2/kitchen/tickets?outletId=&stationId=&status=&limit=&cursor=` | `kitchenTickets`. Cola por defecto PENDING/IN_PREPARATION/READY; orden estable sentAt,id; limit 1–200, default 100. `{data,pagination:{hasMore,nextCursor},serverTime}`. Lectura de Cocina; cursor y estación se validan en el mismo contexto |
| C6 `GET /pos/v2/kitchen/tickets/:id` | `getKitchenTicket`. Recupera también tickets fuera de la cola activa, su versión, snapshots y los últimos 20 intentos de impresión, sin incrementar contadores. Mismo permiso y scope |
| C6 `PATCH /pos/v2/kitchen/tickets/:ticketId/lines/:lineId` | `updateKitchenLine`. `{expectedVersion,status,reason?}`; aquí expectedVersion es **la versión de la línea de ticket**, no la de orden. Devuelve línea, ticket derivado, orderId y orderVersion. `pos.cocina.operate` OR `pos.stations.manage` |
| C6 `POST /pos/v2/orders/:id/lines/:lineId/void-preparation` | `voidPreparation`, `{expectedVersion,reason}`; versión de orden. `pos.orders.cancel`, antes del primer pago y antes de entrega terminada. Anula sin borrar; no fabrica movimientos de existencias |
| C6 `GET /pos/v2/orders/:id/seat-totals` | `seatTotals`. `{seats:[{id,label,totalAmount,paidAmount,remainingAmount,lineIds}],orderTotal,refundedAmount,netOrderTotalAmount,paidAmount,remainingAmount,generalPaidAmount,allocations}`. Lectura de órdenes |
| C3 `POST /pos/v2/orders/:id/payments` | `addPayment` conserva su firma y admite `allocations:[{orderLineId,amount}]`. Caja: payments.create/caja.operate y sesión explícita autorizada de la misma sucursal. Cobro en mesa: comandas.charge, allowTableCharge y turno propio; no concede acceso a Caja |
| C6 `POST /pos/v2/orders/:id/payment-allocations` | `allocatePayment`, `{expectedVersion,paymentId,allocations}`. Atribuye/reemplaza atribuciones del pago neto sin crear capturas ni cambiar impuestos. Permiso de cobro en Caja; auditoría de antes/después |
| C2 `GET /pos/v2/orders?experience=RESTAURANT&outletId=&pendingPayment=true` | `listOrders`. Filtra cuentas no terminales con consumo; datos y count usan el mismo filtro/paginación. Agrega tableName, orderLabel y waiterName. Pago parcial sigue pendiente; pago final desaparece del filtro |
| C6 `POST /pos/v2/reservations/:id/seat` | `seatReservation(id,{},token,options)`; sessionId opcional. Reserva, mesa, cuenta, comensales y auditoría se confirman juntos; preserva nombre/teléfono y vínculo de la reserva. Permiso de creación |
| C7 `POST /pos/v2/kitchen/tickets/:id/print-jobs` | `kitchenPrintJob`, `{transport:"BROWSER"|"BLUETOOTH",reason?}` → PrintJobDTO con ticketId/payload/copy/status. Lectura de Cocina |
| C7 `POST /pos/v2/print-jobs/:id/result` | `finishPrintJob` sirve a recibos y Cocina. `{status:"SUBMITTED"|"FAILED",errorCode?}`; creador del intento o admin autorizado, además de acceso al tipo de documento. El cliente no puede declarar CONFIRMED |
| C4/C5/C7/C8 existentes | Cancelaciones, devoluciones, stock, recibos, sesiones y recepción de turno mantienen rutas/SDK reales y sus permisos. Se integraron atribuciones en devoluciones; no se rediseñaron turnos de meseros |

Para tomar pedidos, usar `restaurantOperationState`: SELECT_OUTLET, EXPERIENCE_NOT_AVAILABLE, CONFIGURATION_REQUIRED o READY. El `operationState` anterior sigue describiendo Caja y puede indicar SELECT_TERMINAL aunque Restaurante ya esté listo. No exigir terminal al mesero por interpretar ese campo de Caja. `preparation` informa KDS/impresión habilitados, modo manual y umbral de retraso. `tableCharge` respeta configuración y permiso; no equivale a permiso financiero de Caja.

C0 publica fase 4 con `restaurantBackendReady:true`, `restaurantUiReady:false`. Tienda conserva su cierre integrado (`retailBackendReady:true`, `retailUiReady:true`). Los nombres físicos/API para TIENDA, RESTAURANTE y MIXTA son RETAIL, RESTAURANT y HYBRID; Mixta mantiene experiencias distintas sobre una misma caja/libro comercial.

### DTO de Cocina y estados

Cada ticket nuevo entrega `dispatchedAt`, `orderLabel`, `tableName` nullable, `waiterName` nullable, `dispatchSequence`, `lateAfterMinutes:15`, `isLate`, stationId, orderId, version y líneas con producto/variante, cantidad, note, modifiers, status y version. Secuencia 1 es primer envío; mayor que 1 permite mostrar «Extra · envío n». Son valores del envío del servidor; cambiar después la mesa o los modificadores no altera esos snapshots.

Una línea nueva enviada queda identificada por `dispatchedAt`; cantidad/precio/modificadores/notas ya enviados no se editan silenciosamente. Los extras usan otra línea y otro envío. Las partidas nuevas todavía no enviadas se pueden editar aun cuando la orden ya tenga envíos. Repetir un envío con otra clave no vuelve a enviar líneas ya despachadas; sin nuevas partidas devuelve NO_PENDING_LINES. La misma clave recupera exactamente el envío original.

El recorrido de Restaurante envía las partidas preparables antes del cobro final. C6 rechaza nuevos envíos sobre PAID, CANCELLED o REFUNDED. Los avances KDS posteriores sobre PAID corresponden a envíos ya existentes y sólo cambian preparación/entrega, sin reabrir el estado financiero.

Preparación automática exige estación habilitada de la misma sucursal, específica o default. Una estación ajena/deshabilitada no se utiliza como fallback. Si KDS e impresión están desactivados en la sucursal, el resultado declara `manual:true`, conserva el despacho y skippedLineIds sin tickets ficticios. Los artículos sin preparación también se informan como omitidos de Cocina.

Transiciones: PENDING → IN_PREPARATION → READY → DELIVERED. El estado de ticket se deriva atómicamente de sus líneas, no de un PATCH arbitrario de tarjeta. CANCELLED sólo proviene de cancelación/anulación autorizada con motivo. D20 permite un paso inverso READY→IN_PREPARATION o IN_PREPARATION→PENDING únicamente al autor del último cambio, con motivo, dentro de cinco segundos y antes del estado financiero terminal; el deshacer no se encadena. DELIVERED no retrocede. Cocina puede avanzar la entrega de una orden PAID sin reabrirla ni volver a descontar stock; no revierte pagos.

Los tickets históricos sin despacho/snapshot permanecen legibles con `historicalDispatchUnknown:true`, `dispatchSequence:null` y `historicalSnapshotUnknown` por línea. No se les inventa una secuencia ni se reenvían automáticamente; impresión nueva de un ticket sin snapshot verificable requiere conciliación.

### División, caja y existencias

La cuenta sigue siendo una orden. Comensales agrupan sus partidas, no crean otro saldo. Se puede pagar parcialmente por importes o atribuir a partidas/comensales; la suma asignada no excede el pago neto ni el importe no asignado de cada partida. Cobrar de nuevo un asiento cubierto falla aunque otro comensal aún deba dinero. Los pagos generales se muestran en `generalPaidAmount`; no se distribuyen silenciosamente.

Reatribuir no crea dinero, no duplica IVA y conserva historial en auditoría; las filas reemplazadas se mantienen a cero. Al devolver se reducen las atribuciones para respetar tanto el neto de partidas como el de pagos, en orden estable; cualquier parte general restante se muestra explícitamente. `orderTotal` conserva el total original, `netOrderTotalAmount` suma partidas netas de devoluciones y `refundedAmount` explica la diferencia. La operación monetaria y su comprobante siguen siendo C3/C4, con redondeo Decimal compartido.

Caja puede cobrar una orden RESTAURANT desde una terminal vigente de su misma sucursal, aunque otra terminal fuera el origen. RETAIL conserva su vinculación estricta a la terminal de la orden. Sesión cerrada, sucursal ajena, terminal revocada o permiso insuficiente no capturan. Pago final libera la cuenta y deja la mesa DIRTY; limpieza autorizada pasa a AVAILABLE. RESERVED se atiende mediante la reserva; BILL_REQUESTED no es un pago y no altera el saldo.

Productos preparados usan el mismo Catálogo, variantes, modificadores y política fiscal/comercial. `trackStock:false` no consume ingredientes ni crea movimientos. `trackStock:true` consume unidades comerciales de la sucursal exactamente una vez al completar la venta, con el libro existente; no se introdujeron recetas, BOM, reservas de ingredientes, sobreventa, propinas o servicio automático.

### Intentos, errores y recuperación

Guardar clave, IDs, cuerpo y versión por identidad/empresa/contexto antes de enviar. Respuesta perdida: reenviar el mismo intento; no reconstruir el cuerpo ni usar otra clave. Misma clave con distinto cuerpo da IDEMPOTENCY_CONFLICT. Escritura sin clave válida: 428. Replay se resuelve dentro de la transacción y después de la autorización HTTP vigente. El actor original permanece en el documento y auditoría, aunque otro operador autorizado recupere su resultado.

ORDER_VERSION_CONFLICT (orden) y RESOURCE_VERSION_CONFLICT (mesa/línea de Cocina) requieren refrescar y decidir una intención nueva; no aplicar un cambio sobre la versión nueva automáticamente. Cocina también incrementa la versión de orden: después de actividad KDS, Comandero debe refrescar antes de agregar extras. Notificaciones `pos.order.updated` se emiten después del commit; un fallo de notificación no deshace la operación.

Errores adicionales implementados: TABLE_OCCUPIED, TABLE_NAME_CONFLICT, ALLOCATION_CONFLICT, NO_PENDING_LINES, PREPARATION_ALREADY_DISPATCHED, UNDO_NOT_ALLOWED, PREPARATION_STATION_REQUIRED, REFUND_REQUIRED y los errores existentes de scope, stock y conciliación. V2 conserva `{error:{code,message},requestId}`. Desconectado: no enviar nuevos comandos; al reconectar recuperar clave pendiente, consultar orden y recargar cola/mesa. Recorrer nextCursor mientras hasMore; la cola no presume que la primera página sea todo el trabajo. `getKitchenTicket` permite recuperar por ID un ticket ya entregado.

## Migración y compatibilidad

`20261101233000_commerce_restaurant` es expansiva: outletId/version en mesas, floorId nullable; trazabilidad de envío en líneas; `PosKitchenDispatch`; versiones/snapshots/transición en Cocina; `PosPaymentAllocation`; ticketId nullable y receiptId nullable en `PosPrintJob` con XOR de documento. Agrega índices, FKs, checks y triggers de scope/inmutabilidad. Conserva los intentos de impresión anteriores con receiptId.

El backfill copia únicamente la sucursal demostrable del piso de cada mesa y empresa. No elige la primera sucursal, no cambia IDs/geometría/reservas y no fabrica envíos, atribuciones o movimientos históricos. Un vínculo histórico inconsistente queda sin sucursal demostrada y requiere conciliación para operar; no se corrige por conjetura. Los cambios de mesa del administrador/planner también invalidan su versión; se impide moverla a otra empresa/sucursal o liberarla con cuenta activa.

RLS y revocación de grants públicos se aplican a las tablas nuevas y a mesas/estaciones/tickets/líneas de preparación consumidas por C6. El acceso operativo pasa por API y permisos. El alcance vigente es permiso de puesto + empresa activa + sucursal habilitada y relaciones de IDs; no se inventó un sistema de asignaciones individuales de sucursal/estación/terminal.

Las rutas históricas de lectura y el Floor Planner continúan. Los alias de envío, totales por comensal, atención de reservas y cambios por línea usan los comandos seguros; los PATCH globales antiguos que podían saltar estados siguen rechazados. No se reactivó `/pos/terminal` ni el carrito heredado de Tienda. No se borraron órdenes, pagos, sesiones, planos o productos. Los escritores antiguos que omiten versión/clave necesitan el nuevo SDK; su lectura histórica no exige migrar identidades ni alias.

## Pruebas y aceptación

| Ejecución | Resultado |
|---|---|
| `node scripts/test-commerce-postgres.mjs` | **195/195**, 31 suites, cero fallos/skips. PostgreSQL local desechable de dos conexiones, API Hono real y SDK; conserva suites anteriores, agrega casos Restaurante y fixture C6 |
| Migración del runner | Mesa/ID/piso, reserva completa y geometría comparados antes/después; sin envíos/atribuciones fabricados; RLS y grants comprobados. Conserva verificaciones históricas financieras/stock/C7 de fases previas |
| `.e2e/commerce-restaurant-phase4-api.mjs` | **20/20**, HTTP con autenticación real, dos meseros, cocinero y cajero con roles distintos, PostgreSQL/Supabase desechable y web compilada desde el árbol |
| `.e2e/pos-retail-ui.mjs` | **83/83**, frontend de Tienda conservado, sin errores de página/5xx |
| `.e2e/catalog-integration-validation.mjs` | **90/90**, Catálogo, stock, roles, recuperación, sync y regresión responsive |
| `.e2e/commerce-gallery-phase3.mjs` | **17/17**, galería, portada/reordenación persistida y SortableList; controles de 44 px |
| Unitarias POS/Catálogo/SDK/`@runly/ui`/brandTheme | **294/294**, 21 suites, cero fallos/skips |
| Prisma generate/validate, ESLint API/POS, UUID policy y diff-check | Correctos |
| RBAC | 349 permisos, cero faltantes/sobrantes; sin grants nuevos para tomar pedidos |
| Privacidad | Control global: exit 1, los mismos **67 hallazgos preexistentes**. Los 25 archivos propios de implementación pasan individualmente con cero hallazgos; este informe se revisa separadamente |

Las utilidades `.e2e` son procedimientos locales ignorados; no son nuevos endpoints ni pantallas de prueba. La suite PostgreSQL, los fixtures de contrato y la prueba SDK quedan versionados. Hubo pasadas intermedias fallidas por nombres de configuración del fixture, permisos explícitos del test directo de impresión y preparación incorrecta de stock de fixture; se corrigieron y repitieron. No se cuentan como aprobadas ni se sustituyó PostgreSQL por mocks.

| Aceptación solicitada | Evidencia ejecutada |
|---|---|
| 1–2 Sin planner, crear mesa/abrir cuenta | DB sin pisos + API/SDK; mesa con floorId null, cuenta y comensales reales |
| 3 Dos meseros sobre la misma mesa | Dos conexiones y dos usuarios HTTP reales: una cuenta, segundo TABLE_OCCUPIED |
| 4–5 Productos, variantes, modificadores/notas | C2/C1 existentes; selección requerida, sobreprecio/snapshot, nota y variante de Tienda conservadas; KDS muestra los datos del envío |
| 6–8 Enviar/reintentar/respuesta perdida | Commit real seguido de fallo de transporte; misma respuesta/envío/ticket con la clave original, también concurrentemente; fallo de auditoría revierte el despacho |
| 9–10 Extras y secuencia | Nuevo envío 2 con sólo partidas nuevas; anteriores omitidas; cantidad pendiente editable y enviada bloqueada |
| 11 Cocina/reconexión | Otro cliente consulta los mismos snapshots; cola paginada y detalle por ID, sin depender del teléfono del mesero |
| 12–14 Avance, reverso seguro, transiciones ilegales | Versionado de línea/ticket/orden; deshacer del autor en ventana; rechazo a otro actor, vencimiento, saltos, entregas y retroceso financiero |
| 15–16 Mesero sin Caja/cobro no autorizado | Rol real toma/envía; pago a sesión denegado. Cobro en mesa separado exige permiso/configuración y turno propio |
| 17 Mesa cobrada desde Caja | Sesión autorizada de sucursal; origen de terminal distinto admitido sólo para Restaurante; sesión ajena rechazada |
| 18 División coherente | Asientos/partidas, pagos generales, asignación posterior, decimales/IVA y devolución parcial sin exceder líneas ni pagos netos |
| 19 Parcial/final sin duplicación | Capturas con replay, asiento pagado no repetible y versiones concurrentes; HTTP total $175, aplicado $50 + $125, cambios $50 y $75 |
| 20 Liberar mesa | Pago final → DIRTY sin cuenta activa; limpieza → AVAILABLE y nueva cuenta. Cancelar con anticipo bloquea |
| 21–22 Motor compartido/Mixta | RETAIL sin mesa/comensales/Cocina; RESTAURANT conserva su flujo; dos cajas y experiencias compiten por una última unidad: una captura/salida |
| 23 Scope/revocación | Empresa/sucursal/estación/cursor ajenos rechazados; terminal revocada en regresión Tienda; mismo token de Cocina denegado después de revocar operate |
| 24 Concurrencia PostgreSQL | Mesa, edición de orden, estado KDS, dispatch/replay, captura/stock y entrega de turno con conexiones independientes |
| 25 Regresiones | Suites POS/Commerce/Catálogo/SDK/UI, navegador Tienda/Catálogo/galería y adaptadores Canvas anteriores conservados |

Prueba SQL del recorrido autenticado: orden PAID de $175, dos capturas del cajero, un comprobante SALE y una salida comercial de una bebida; los platillos no controlados no producen consumo ficticio. La entrega de turno se probó además con dos clientes: un WAITER_DELIVERY y una sola suma en Caja. No se afirma haber ejecutado todavía el recorrido visual de las nuevas pantallas.

## Discrepancias, límites y entrega a frontend

- **D12 implementada:** activeOrder, readyLineCount y Mis mesas. Nombre definitivo del importe: **totalAmount**, consistente con OrderDTO; no `total` calculado por React.
- **D20 implementada:** deshacer de un paso, cinco segundos, autor/motivo/versión/auditoría; sin revertir entrega o estado financiero terminal.
- **D23 implementada:** Pedir cuenta mediante BILL_REQUESTED; no implica imprimir una pre-cuenta ni cobrar.
- **D26 implementada:** campos de comanda y secuencia de extras verificables en servidor, retraso a los 15 minutos y snapshots históricos explícitamente desconocidos cuando corresponda.
- **D24 fuera de v1:** no se implementa impresión de pre-cuenta OPEN; C7 cubre recibos financieros y comandas. D18/preferencias y administración posterior no se adelantan.
- **Hardware pendiente:** impresora/Bluetooth, papel/confirmación física, terminal bancaria y dispositivo táctil reales. SUBMITTED sólo acredita envío al transporte. Selección persistente de impresora continúa pendiente; no se simularon resultados físicos.

Claude puede construir las pantallas autorizadas de mesas, Comandero, Cocina y Caja Restaurante usando los métodos anteriores y los fixtures validados. Debe conservar selección explícita por usuario/empresa, intentos persistentes, mensajes de conflicto y separación entre operador actual, mesero asignado y actor financiero. No volver a conectar mutadores antiguos sin versiones, calcular impuestos/cambio como autoridad, cobrar un asiento sólo con su total visual ni usar el contador histórico como prueba de impresión.

**No quedan defectos críticos/altos abiertos de la base técnica implementada que bloqueen ese frontend.** La certificación del producto Restaurante completo exige la integración visual de Claude, sus recorridos de navegador y la prueba física correspondiente. No se inició ese trabajo ni la fase 5.
