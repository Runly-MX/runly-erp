# Runly Commerce Recovery — frontend de Restaurante y Cocina (fase 4)

Fecha: 2026-11-01. Base: `ea17f85fc`. Solo código local y pila desechable; sin SSH, push ni despliegue. No se tocaron servicios, migraciones ni contratos del backend.

## Pantallas implementadas (`apps/desktop/src/modules/runly.pos/restaurant/`)

- **Mesas / Comandero** (`/pos/comandero`, `/pos/tables`): cuadrícula o lista, filtros Todas/Libres/Ocupadas/Por cobrar, Mis mesas, cuenta, mesero, comensales, tiempo, total y «N listas». Crear mesa (nombre y capacidad, sin plano) solo con `floorPlanner`. Marcar limpia una mesa por limpiar.
- **Cuenta de mesa** (`/pos/comandero/mesa/:id`): abrir mesa con comensales, productos con variantes (diálogo existente), modificadores y nota, edición de partidas sin enviar, cuenta separada en «Sin enviar» / «Envío n» con estado de cocina, Enviar a cocina con confirmación y reintento de la misma clave, comensales, Pedir cuenta, anular partida enviada (si hay permiso), vínculo a Caja.
- **Cocina (KDS)** (`/pos/cocina`): columnas Nuevas/Preparando/Listas (pestañas bajo 1024 px), filtro por estación, paginación por cursor, tarjetas con mesa, mesero, hora, tiempo, «Extra · envío n», retraso, notas; botones de 56 px, «X todo», deshacer 5 s, errores por línea con reintento.
- **Caja Restaurante** (dentro de `/pos/caja`): cuentas por cobrar, consumo, subtotal/impuestos/total/pagos/saldo, cobrar completa, por comensal, por partidas o por importe, efectivo y cambio, comprobante y estado real de la mesa. Sucursal Mixta: selector **Mostrador / Mesas** sin perder la venta de mostrador.

Reutilizado: `useRetailContext`, `PosContextGate`, `usePosCommand` y diario `createOrderWorkflow`, `SellablePanel`, `ChargeDialog` (props nuevas `allocations`, `fixedAmount`, `title`), `SaleCompletePanel`, `ReceiptDialog`, `CommandFailureAlert`. `SegmentedControl` de `@runly/ui` gana `size="lg"` (documentado). Nuevos: `RestaurantShell`, `TableCard`, `CreateTableDialog`, `ItemOptionsDialog`, `ComandaPanel`, `OrderDialogs`, `TicketCard`, `AccountCheckout`, `RestaurantAccounts`, hooks `useTableOrder`, `useKitchenBoard`/`useKitchenActions`, `useWideLayout`, reglas puras en `restaurantRules.js`.

## Contratos consumidos

`context` (`restaurantOperationState`, `capabilities.takeOrders/charge/kitchenOperate/floorPlanner`), `tables`, `createTable`, `updateTable` (limpiar), `createOrder`, `addLine`, `updateLine`, `deleteLine`, `updateRestaurantOrder`, `requestBill`, `modifiers`, `dispatchKitchen`, `kitchenTickets`, `stations`, `updateKitchenLine`, `voidPreparation`, `seatTotals`, `addPayment` con `allocations`, `listOrders(experience=RESTAURANT, pendingPayment)`, `getOrder`, recibos. Todas las escrituras con clave persistida en `localStorage` por usuario/empresa/recurso.

## Pruebas ejecutadas

| Ejecución | Resultado |
|---|---|
| `.e2e/commerce-restaurant-ui.mjs` (nuevo, pila desechable, navegador real) | **133/135**; recorridos 1–28 completos y barrido 4 anchos × claro/oscuro |
| `.e2e/pos-retail-ui.mjs` (Tienda) | **83/83** (el chequeo 21 se actualizó: una sucursal Restaurante ahora abre la Caja de cuentas) |
| `.e2e/catalog-integration-validation.mjs` | **90/90** |
| Unitarias (reglas de restaurante, Tienda, SDK) | 22/22 |
| ESLint (POS + SegmentedControl), `vite build` | Correctos |

Cubierto en navegador: sucursales solo Restaurante/Mixta; mesas sin plano (0 pisos); mesero sin sesión financiera; variante + modificador + nota guardados por el servidor; edición previa al envío; respuesta perdida tras commit y reintento con la misma clave (1 envío, 1 ticket); botón bloqueado tras enviar; KDS con mesa/mesero/hora/notas; deshacer; extras con «Extra · envío 2»; conflicto de versión explicado; división por comensal, cambio, pago perdido reintentado (2 capturas, sin duplicado); mesa DIRTY solo tras confirmar; mesero sin cobro (403), cocina sin lectura de órdenes (403); Mixta conserva la venta y su modalidad RETAIL; aislamiento por empresa.

## Fallos restantes

Dos chequeos de contraste en Comanda a 390 px (claro y oscuro): un `<span>` con «3» a 1.49:1. Sospecho de la insignia del botón flotante de chat global (no es parte de estas pantallas), pero **no lo verifiqué**. El total ya no queda bajo ese botón.

## Diferencias y límites

- Sin prototipo pixel a pixel: se aplicó el sistema visual de Tienda.
- Cobro en mesa por el mesero (turno propio, `comandas.charge`) **no** implementado: cobra Caja.
- Sin impresión de comandas desde Cocina (la ruta existe en SDK). Sin sonido ni notificaciones push: actualización por sondeo (5–10 s).
- División «por comensal» requiere que las partidas tengan comensal; el selector de comensal por partida existe solo en el diálogo de opciones (productos con modificadores).
- Pantallas heredadas (`PosTablesScreen`, `ComandaScreen`) quedan sin ruta; limpieza en fase 5.
- Sin probar: tableta táctil real, impresora, terminal bancaria.

## Veredicto

**APTO para revisión de integración por Codex**, con los dos contrastes y las limitaciones anteriores visibles.
