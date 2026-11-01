# Recuperación POS + Catálogo — auditoría y contrato maestro

Fecha: 2026-11-01. Base inspeccionada: `46d6d6be7`, rama `main`.
Estado: especificación técnica de la primera ejecución; implementación pendiente.
Plan ejecutable: [etapas, pruebas y cierre](../plans/2026-11-01-pos-catalog-recovery.md).

## 1. Alcance y decisiones cerradas

Conservar un motor transaccional POS, sus órdenes, sesiones, pagos y cortes. Separar dos experiencias sobre él: Tienda y Restaurante. `HYBRID` permite elegir experiencia en la misma sucursal; no crea otra caja ni otro saldo. Catálogo es la fuente de productos y variantes comerciales. `runly.inventory` conserva bienes físicos y no participa en descontar ventas.

Esta ejecución entrega auditoría, contratos y plan. No modifica servicios, pantallas, esquema, migraciones ni datos. No hace SSH, despliegues, push ni llamadas a instalaciones. El trabajo visual y React corresponde a Claude; Codex implementará integridad, contratos, servicios, permisos, persistencia y pruebas en ejecuciones posteriores. No se autoriza con este documento la ejecución automática de las etapas 1–6.

Los contratos C0–C8 siguientes son el objetivo acordado para implementar, **no endpoints que ya estén disponibles**. Las tablas de auditoría describen el estado actual. Claude puede preparar fixtures y diseño funcional con esta especificación; conectar pantallas requiere la evidencia de disponibilidad de cada contrato. No sustituir fallos financieros con cálculos visuales ni mostrar confirmación de impresión por registrar una fila.

## 2. Método y evidencia

Descubrimiento inicial con `codebase-memory-mcp`: proyectos, búsquedas de símbolos, consulta de archivos, snippets y traza saliente de `addPayment`. El índice local ya existía. Algunos snippets devolvieron líneas desplazadas y la traza enlazó métodos de mocks como si fueran implementaciones. Se contrastaron las conclusiones con los archivos actuales; el grafo sirve para descubrir, no prueba transacciones ni cobertura.

Lecturas de referencia: `docs/ai-context/rme3-modules.md`, `rme3-runtime-capabilities.md`, `docs/REPOSITORY_PRIVACY.md`, especificaciones POS del 2026-06-21, rework Caja del 2026-07-18, estados POS/Catálogo del 2026-08-30, identidad oficial del 2026-09-13 y Canvas operativo del 2026-10-02. Las notas de agosto no reflejan todas las correcciones posteriores: Catálogo sí tiene modelos Prisma core; el router POS ya está separado; el catálogo público ya resuelve empresa por slug/sitio. Una afirmación histórica de «completo» no acredita operación táctil o hardware.

Cambios preexistentes preservados: `apps/api/package.json` y `apps/api/scripts/dev-watch.mjs`. No forman parte de esta entrega. Las rutas de código se expresan desde la raíz del repositorio. No se leyó configuración de conexiones ni se verificó el estado aplicado de una base de datos.

Durante la auditoría HEAD avanzó por trabajo concurrente a `1c0fda679` (commits de shell/calendario y dev-watch); los cambios preexistentes quedaron confirmados por esa otra actividad. Esta ejecución no los editó, revirtió ni incluyó en su propio commit. El alcance de las pruebas y la auditoría sigue siendo el indicado, sin atribuir validación a esos cambios ajenos.

Clasificación: **CONFIRMADO** = camino observable en el código actual (se distingue de reproducción ejecutada); **NO REPRODUCIDO** = evidencia inspeccionada contradice el defecto concreto; **REQUIERE VALIDACIÓN** = no hay evidencia suficiente para afirmar el resultado operativo. No reproducido no significa certificado en producción.

### Inventario técnico actual

| Área | Fuente actual | Evaluación |
|---|---|---|
| Identidad y navegación | `apps/api/src/manifests/official/core-modules.js:996`, `:1143`; `apps/api/src/permission-catalog.js` | `runly.catalog` 2.2.0 y `runly.pos` 0.2.0 son CORE, no desinstalables, con PWA. POS navega a Caja, Comandero, Cocina, Órdenes y Administración. Conservar identidades y alias persistidos; no migrar `atlas.*` aquí. |
| API POS | `apps/api/src/routes/pos/pos-routes.js`, `pos-floor-routes.js`, `validators.js` | Hono, contexto de empresa del middleware y permisos por ruta. Separación parcial existente; no repetir el refactor histórico de 806 líneas como defecto actual. |
| Servicios | `pos-order-service.js`, `pos-session-service.js`, `pos-waiter-shift-service.js`, `pos-scope-service.js`, `pos-floor-service.js`, `pos-kitchen-service.js`, `pos-modifier-service.js`, `pos-reservation-service.js` en el directorio anterior | Hay snapshots de líneas, modificadores y asignación de mesero. Integridad desigual entre comandos. |
| Catálogo | `apps/api/src/routes/catalog/{products,categories,variants,stock}-routes.js`, `catalog-{product,variant,stock,public}-service.js`, `validators.js` | CRUD, variantes, publicación y movimientos manuales por SQL parametrizado; listado devuelve nombres snake_case y paginación. |
| Persistencia core | `prisma/schema.prisma:2891–3533` | `CatalogProduct`, `CatalogProductVariant`, `CatalogStockMovement` y modelos `Pos*` existen como Prisma core. No son tablas RME3 custom. Precio catálogo 12,4; precio POS 12,2; cantidad POS 12,3; stock comercial entero. |
| Migraciones leídas | `20260601000000_add_catalog_core_tables`, `20260621190000_add_atlas_pos`, fixes de IDs/timestamps del 2026-06-21, `20260622000000_pos_order_terminal_id`, `20260622100000_pos_reservations`, `20260629120000_pos_waiter_split_bill`, `20260717120000_pos_rework_f1_money_containers`, `20260718120000_pos_rework_f2_modifiers` | Contenedor de pago XOR sesión/corte mediante CHECK NOT VALID para legado; unicidad de folio por empresa. No inferir que estén aplicadas localmente. No editarlas. |
| Frontend POS | `apps/desktop/src/modules/runly.pos/screens/`, `hooks/`, `components/` | Caja envuelve Terminal; Comandero envuelve Mesas. Hay pago, división, cortes, comandas, KDS y plano, pero sus contratos no cierran todo el recorrido. |
| Frontend Catálogo | `apps/desktop/src/modules/runly.catalog/` | Productos, detalle, categorías, existencias, opciones, matriz, archivos. `VariantMatrix.jsx:65` conserva tabla HTML; controles actuales ya usan componentes compartidos. |
| SDK y dispositivos | `packages/sdk/src/index.js`, guía de capacidades RME3, `docs/mobile/RUNLY_NATIVE_HOST.md` | SDK transporta opciones de catálogo sin renombrarlas. Existe capacidad compartida Bluetooth según host; no se encontró su conexión al flujo POS de recibos. Reutilizar tras verificar capacidades, no inventar otro bridge. |

## 3. Auditoría de candidatos y trazabilidad

Los IDs H son estables para vincular implementación, aceptación y evidencia. T identifica las pruebas futuras definidas en el plan.

| ID / problema original | Estado y evidencia actual | Impacto / contrato / etapa / prueba |
|---|---|---|
| H01 Lectura de terminales y sucursales | **CONFIRMADO por inspección.** `pos-routes.js:83,100,128` exige `pos.settings.manage` incluso para GET settings/outlets/terminals que consume Terminal. Permisos de puesto no garantizan ese permiso administrativo. No se ejecutó un login de cajero. | Alto: operar exige administración. C0; 1; T01. |
| H02 Recibido, pago y cambio | **CONFIRMADO por inspección.** `components/PaymentDialog.jsx` calcula cambio pero envía `amount = recibido`; `addPayment` rechaza `amount > remaining`; schema no tiene tendered/change. Caso 100 debidos, 200 recibidos produce rechazo en lugar de pago 100/cambio 100. | Crítico comercial; C3; 1; T02. |
| H03 Cancelación con pagos parciales | **CONFIRMADO por inspección.** `cancelOrder` usa `assertEditableOrder`, que sólo bloquea PAID/CANCELLED/REFUNDED. OPEN con pago parcial puede cancelarse sin compensar pagos; cancelación y mesa son escrituras separadas. | Crítico financiero; C4; 1; T03. |
| H04 Devoluciones ausentes | **CONFIRMADO en el ámbito POS inspeccionado.** No hay ruta/servicio/entidad de devolución. REFUNDED es estado validado, no flujo implementado. | Crítico comercial; C4; 1,3; T04. |
| H05 `category_id` / `categoryId` | **CONFIRMADO por cadena completa inspeccionada.** `ProductGrid.jsx` envía category_id; SDK `toQueryString` preserva claves; `products-routes.js:13` sólo lee categoryId. | Alto: filtro ignorado; C1; 2,3; T05. |
| H06 SKU y código de barras | **CONFIRMADO por inspección.** ProductGrid carece de búsqueda/escaneo; `catalog-product-service.listProducts` busca sólo `p.name`. Proyección de listado no incluye barcode. | Alto: venta rápida incompleta; C1; 2,3; T06. |
| H07 VARIABLE sin variante | **CONFIRMADO por inspección.** Terminal envía productId sin variantId; `loadCatalogSnapshot` acepta producto padre sin revisar productType. Variante consultada por empresa, sin verificar productId enviado ni enabled. | Alto: precio/stock incorrecto; C1,C2; 1,2,3; T07. |
| H08 Límite de productos POS | **CONFIRMADO por inspección.** Listado default 50; hook selecciona sólo data y descarta pagination; ProductGrid no avanza páginas. No afirmar pérdida de registros; quedan fuera del recorrido. | Alto; C1; 2,3; T08 (501 registros). |
| H09 Venta habilitada por sucursal | **CONFIRMADO por inspección.** `PosProductConfig.availableInPos` existe por empresa/producto/variante, sin outletId; Terminal consulta Catálogo general y `loadCatalogSnapshot` no aplica disponibilidad. | Alto; C1,C2; 1,2; T09. |
| H10 Retail como DINE_IN | **CONFIRMADO por inspección.** `PosTerminalScreen.handlePay` y `handleSendToKitchen` fijan DINE_IN; `createOrder` crea comensales incluso en mostrador. Cambiar etiqueta Tienda no corrige el tipo. | Alto; C2; 3; T10. |
| H11 Stock al completar venta | **CONFIRMADO por inspección.** `addPayment` cambia PAID sin llamar al servicio de existencias ni escribir movimientos. `catalog-stock-service` sólo registra ajustes invocados explícitamente. | Crítico comercial; C3,C5; 1,2; T11. |
| H12 Moneda Catálogo / POS | **CONFIRMADO por inspección.** Catálogo default USD, POS MXN; snapshot sólo trae precio y orden no tiene moneda. No hay conversión ni rechazo de mezcla. No se comprobaron monedas de datos reales. | Crítico financiero; C1–C3; 1,2; T12. |
| H13 IDs conservados entre empresas | **CONFIRMADO como defecto de estado local.** `PosTerminalScreen` usa claves globales `runly.pos.outletId/terminalId`; limpia sólo cuando ambas listas tienen elementos. No valida pareja outlet/terminal al restaurar. Filtrado servidor sí existe, por lo que acceso cruzado efectivo **REQUIERE VALIDACIÓN**. | Alto; C0; 1,3; T13. |
| H14 Primera sucursal en Comandero | **CONFIRMADO por inspección.** Comandero renderiza PosTablesScreen; `effectiveOutletId = outletId || outlets[0]?.id`. Salón activo o primero se selecciona igualmente. | Alto: pedido en sucursal equivocada; C0,C6; 4; T14. |
| H15 Recepción e impresión de tickets | Registro **CONFIRMADO**, impresión real **REQUIERE VALIDACIÓN**. `reprintReceipt` crea payload REPRINT con printedCount=1; hook sólo muestra «Recibo reenviado». No invoca impresión. Envío a cocina sí crea tickets y lectura KDS existe; recepción en dispositivo no se probó. | Alto; C6,C7; 3,4; T15. |
| H16 Doble pago concurrente (protección existente) | **NO REPRODUCIDO** en el caso de pago contra otro pago con igual paidAmount leído: transacción y updateMany/CAS rechazan segundo cambio; prueba existente pasa. No equivale a idempotencia del mismo intento repetido después de commit parcial. | Conservar CAS; C3; 1; T16. |
| H17 Referencias de orden entre empresas/sucursales | **NO REPRODUCIDO** para creación de orden: `pos-scope-service` valida outlet, terminal, sesión y mesa; validaciones nuevas de guest/zone y candidatos de usuarios existen. `addPayment` sólo valida empresa/OPEN de sesión, no misma sucursal/terminal: esa omisión **CONFIRMADA**. | Conservar scope, completar pago/corte/estación; C0,C3; 1; T17. |
| H18 Históricos afectados por cambio de precio | **NO REPRODUCIDO** para cambio del precio de Catálogo: líneas guardan nombre/SKU/precio/tasa y no releen precio al consultar orden. Cambio de línea OPEN sigue permitido incluso con pago parcial (ver H20). | Conservar snapshots; C2; 1; T18. |
| H19 Catálogo público toma primera empresa | **NO REPRODUCIDO** actualmente: `public-website.js:219` resuelve slug por encabezado o sitio. Proyección pública filtra published y enabled. La disponibilidad POS debe ser independiente. | Conservar resolución y publicación; C1; 2; T19. |

### Hallazgos adicionales de integridad

| ID | Estado / evidencia | Tratamiento |
|---|---|---|
| H20 Precio, impuestos y edición concurrente | **CONFIRMADO por inspección.** `loadCatalogSnapshot` acepta unitPrice cliente si no hay modificadores; `updateOrderLine` lo acepta siempre con `pos.orders.update`. `lineAmounts` agrega tasa global sin usar pricesIncludeTax. No hay permiso específico de descuento. Validación de estado, cambio de línea y recálculo están en pasos diferentes; pago CAS sólo compara paidAmount, no versión/total. | Crítico. C2,C3. Etapa 1, T20: forjar precio, impuesto incluido y carrera línea/pago. Recalcular dentro de la misma transacción con bloqueo de orden. |
| H21 Reintentos y auditoría después de commit | **CONFIRMADO por inspección.** Pagos sin clave idempotente; pago parcial repetido cabe otra vez en saldo. Audit de pago fuera de transacción: fallo puede devolver error tras capturar. `toMoney` usa Number y convierte no finito en cero. | Crítico. C2,C3; 1; T16,T21. No invalidar por ello el CAS existente. |
| H22 Apertura/cierre y recepción de cortes | **CONFIRMADO estructuralmente.** Apertura comprueba antes de insertar; índices sesión/turno OPEN no son únicos en esquema/migraciones inspeccionados. `closeSession` tiene CAS de cierre pero lee totales antes; `closeShift` actualiza y luego crea WAITER_DELIVERY sin transacción/CAS; sesión destino no valida sucursal. | Crítico. Carrera real **REQUIERE VALIDACIÓN** en PostgreSQL. C3,C8; 1; T22. |
| H23 Cocina reenvía todas las líneas | **CONFIRMADO por inspección.** `sendOrderToKitchen` vuelve a crear tickets de todas las líneas, sin deduplicar envíos ni verificar estados PAID/CANCELLED. Cuenta estaciones por empresa, no sucursal. Estado de ticket admite saltos arbitrarios; actualizar ticket no sincroniza sus líneas. | Alto. C6; 4; T23. |
| H24 Padre/variante e imágenes | **CONFIRMADO como omisión.** `createVariant` inserta companyId+productId sin validar padre; rutas update ignoran productId del path. `resolveImageUrls(rows)` de listado autenticado no pasa companyId aunque helper soporta scope. Explotación con datos reales **REQUIERE VALIDACIÓN**. | Alto. C1,C5; 2; T24. No declarar Catálogo completamente aislado por pasar 8 tests de tenant. |
| H25 Stock y cambios administrativos | **CONFIRMADO por inspección.** Stock entero frente a quantity decimal POS; actualización directa de stock en producto/variante puede saltarse historial; movimientos sin origen idempotente, sucursal ni reversa. | Alto. C5; 1,2; T25. V1 limita artículos controlados a unidades enteras; no inventar conversión de unidades. |
| H26 División de cuenta incompleta | **CONFIRMADO por contrato inspeccionado.** `SplitBillDialog` manda amount=seat.total sin asiento/line allocations; `getSeatTotals` agrupa consumo pero no atribuye pagos a asientos. Puede cobrarse el mismo asiento mientras aún quede saldo global. | Alto. C3,C6; 4; T26. |
| H27 Restaurante depende del plano | **CONFIRMADO por inspección.** Mesa requiere floorId; Comandero obtiene mesas a través de floorDetail y muestra vacío sin salón. No hay directorio simple independiente del planner. | Alto. C6; 4; T27. |
| H28 Componentes y navegación heredados | **CONFIRMADO por inspección.** PaymentDialog dice «Mesa completa» para retail, matriz usa tabla HTML y algunas pantallas no parten de PageHeader/ErrorState. Rutas de puesto usan permisos de navegación distintos a varios comandos de servicios/KDS (`pos.stations.manage` para operar). | C0,C6; 3–5; T01,T28. Claude resuelve experiencia con UI compartida tras contrato; no reescribir Canvas ni todos los componentes. |

## 4. Arquitectura que se conserva y cambios limitados

Conservar modelos core y todas sus filas, catálogos SIMPLE/VARIABLE, IDs y folios, snapshots de líneas/modificadores, validación `pos-scope-service`, contexto empresarial del middleware, permisos oficiales, API pública, SQL parametrizado, SDK compartido, consultas y componentes reutilizables. Conservar CAS de pagos/cierre como defensa adicional. Conservar Canvas y los adaptadores `floorObjects`/`plannerObjects`; Floor Planner sigue opcional y no es fuente de órdenes ni de existencias.

Reemplazar el camino de escritura dispersa por comandos transaccionales compartidos y reemplazar la consulta de catálogo general desde POS por una proyección vendible. Sustituir más adelante el uso de una Terminal que mezcla conceptos de mesas/retail por dos recorridos React sobre esos mismos comandos. No reemplazar el sistema de caja, pagos o stock por duplicados. La tabla nueva de saldos de Catálogo será la desagregación por ubicación del saldo comercial existente, no otro inventario independiente.

No agregar dependencias: usar Prisma Decimal disponible para importes/rounding, Hono, Zod y node:test existentes. Funciones nuevas de servicio dentro de factories con dependencias inyectadas. Los helpers puros actuales a nivel módulo reciben db explícito; no son evidencia de `ReferenceError` por sí solos. Para tablas custom RME3 continúa prohibido agregar modelos en Prisma o usar accessors inexistentes; esta recuperación concierne a modelos core que sí están declarados.

## 5. Contratos objetivo para backend, SDK y Claude

### Convenciones comunes

Prefijo nuevo de contratos coordinados: `/pos/v2`. Las rutas actuales `/pos/*` y `/catalog/*` permanecen identificadas como legado; se endurecen mediante los mismos servicios. No pueden conservar un camino inseguro que omita invariantes. Nuevos DTO usan camelCase; Catálogo administrativo conserva snake_case en su API actual. La transformación vive en backend/SDK, no dispersa en pantallas.

Empresa deriva únicamente del contexto autenticado validado (`X-Runly-Company-Id` en SDK actual), actor de sesión; nunca confiar en companyId/actorId del body. Validar permiso y pertenencia antes de responder o escribir. Recurso ajeno devuelve 404; falta de permiso 403. Alcance de sucursales: usar el mecanismo de autorización empresarial vigente y una lista explícita de outlets accesibles; no inventar membresías de sucursal que aún no existen. Dentro de la empresa, la configuración de terminal no es por sí sola autorización; todas las referencias de cada comando deben coincidir en outlet. Una futura restricción de empleados por sucursal necesitará política persistida y pruebas propias.

Respuestas nuevas: `{ data: DTO }`; listados agregan `pagination: { page, pageSize, total, hasMore }`. Errores `{ error: { code, message, fieldErrors? }, requestId }`, texto español, códigos estables. 400 VALIDATION_ERROR; 403 FORBIDDEN; 404 NOT_FOUND; 409 ORDER_VERSION_CONFLICT/INSUFFICIENT_STOCK/CURRENCY_MISMATCH/IDEMPOTENCY_CONFLICT/INVALID_TRANSITION; 428 IDEMPOTENCY_REQUIRED. 500 no significa que el cliente deba generar otra clave. Los adaptadores legado conservan error string y añaden code sin cambiar lecturas históricas.

Dinero JSON decimal string con dos posiciones; precio base catálogo puede tener cuatro, con redondeo HALF_UP al obtener precio POS de dos. Cantidad string hasta tres decimales; stock controlado sólo entero en esta entrega. Tasas string hasta cuatro decimales. Nunca usar flotantes para validar saldo. Una moneda por orden, sin conversión automática. Rechazar moneda distinta antes de agregar línea. Campos de empresa/moneda/versión del DTO son de sólo lectura.

### C0 — contexto operativo y permisos

`GET /pos/v2/context?outletId=&terminalId=` devuelve:

```json
{
  "data": {
    "companyId": "<empresa>",
    "outlets": [{ "id": "<sucursal>", "name": "Centro", "mode": "HYBRID" }],
    "terminals": [{ "id": "<terminal>", "outletId": "<sucursal>", "name": "Caja 1" }],
    "selectedOutletId": null,
    "selectedTerminalId": null,
    "currentSession": null,
    "currency": "MXN",
    "capabilities": {
      "retail": true, "restaurant": true, "charge": true,
      "openSession": true, "closeSession": false, "refund": false,
      "discount": false, "kitchenOperate": false, "floorPlanner": false
    },
    "contractVersion": "pos-recovery-v1"
  }
}
```

Sólo devuelve sucursales/terminales habilitadas autorizadas. Si parámetros no pertenecen a la empresa o pareja correcta: 404. Sin selección no elige la primera; selected* null hasta selección explícita. currentSession sólo para terminal validada. Capabilities se calculan desde permisos y configuración, no conceden permisos nuevos.

Lectura operativa permitida a cualquiera de `pos.terminal.use`, `pos.caja.read`, `pos.comandas.read`, `pos.cocina.read`, `pos.admin.read`, `pos.settings.manage`; retornar sólo campos operativos necesarios. Configuración administrativa permanece protegida. Cierres y mutaciones se reautorizan.

| Acción | Permiso aceptado (OR donde se indica) |
|---|---|
| Ver orden | `pos.orders.read` o `pos.caja.read` o `pos.comandas.read` |
| Crear/editar orden | `pos.orders.create/update` respectivamente o `pos.caja.operate` o `pos.comandas.create` |
| Cobrar | `pos.payments.create` o `pos.caja.operate`; `pos.comandas.charge` únicamente con allowTableCharge y turno propio |
| Abrir sesión | `pos.sessions.manage` o `pos.caja.operate` |
| Cerrar sesión/recibir corte | `pos.sessions.manage` o `pos.caja.close` |
| Movimiento manual | `pos.cash.manage` o `pos.caja.operate`; razón obligatoria |
| Operar KDS | `pos.stations.manage` o `pos.cocina.operate`; lectura stations.read o cocina.read |
| Cancelar | `pos.orders.cancel` |
| Devolver / cambiar precio | Nuevos `pos.refunds.create` / `pos.discounts.apply`; sin concesión automática a roles existentes |
| Administrar Catálogo/stock | Conservar `catalog.products.*`, `catalog.categories.*`, `catalog.inventory.adjust`; no derivarlos de operar POS |

Registrar permisos nuevos en manifiesto y permission-catalog, sin renombrar los oficiales existentes. Lectura de vendibles C1 admite operador POS sin CRUD de Catálogo. Actualizar rutas legado equivalentes para eliminar discrepancias de puesto.

Cliente guarda selección por identidad+empresa, la valida al cargar incluso con listas vacías y limpia orden pendiente/consultas al cambiar empresa. No migrar silenciosamente IDs globales ni carritos de otra empresa. Query keys deben incluir companyId/outletId; no depender sólo de limpieza global.

### C1 — vendibles y Catálogo comercial

`GET /pos/v2/sellables?outletId=<id>&categoryId=<id>&search=<texto>&page=1&pageSize=50` (máximo 100) y `GET /pos/v2/categories?outletId=<id>`. Orden determinista nombre,id; filtros idénticos en datos y count. DTO vendible:

```json
{
  "id": "<producto>", "productType": "VARIABLE", "name": "Café",
  "categoryId": "<categoria>", "sku": "CAFE", "barcode": null,
  "price": "45.00", "currency": "MXN", "imageUrl": null,
  "requiresVariant": true, "available": true, "unavailableReason": null,
  "trackStock": true, "stock": null, "priceVersion": 1,
  "tax": { "rate": "16.0000", "included": true },
  "requiresPreparation": true
}
```

Precio de padre VARIABLE es informativo (mínimo de variantes disponibles); stock padre null. `GET /pos/v2/sellables/:productId/variants?outletId=` devuelve `{data:[{id,productId,optionValues,sku,barcode,price,currency,stock,available,unavailableReason,priceVersion}]}`. No hay venta del padre VARIABLE. `GET /pos/v2/scan?outletId=&code=` hace coincidencia exacta de barcode, luego SKU; preserva ceros iniciales y trata SKU sin distinguir mayúsculas. Devuelve `{ data: { matches: [{productId,variantId,name,optionValues,price,currency,available}], ambiguous: false } }`. Si múltiples coincidencias, ambiguous=true y no agrega nada; no imponer unicidad nueva que rechace códigos históricos sin revisión.

Búsqueda parcial incluye nombre, SKU y barcode del producto y de variantes. Una coincidencia de variante devuelve su padre una sola vez en listado; scan sí identifica variante. Paginación preservada por hooks/SDK. Caso con más de 500 productos debe seguir accesible; nunca descargar un lote arbitrario y llamar «Todos» al resultado.

Regla de venta: enabled producto y variante, permiso de canal POS, política de sucursal, moneda compatible y stock de esa sucursal. published controla exclusivamente web; unpublished puede venderse en POS. Un registro deshabilitado nunca se vende por ID directo. Configuración `PosProductConfig` sigue controlando preparación; availableInPos actual se toma como baseline, no se pierde.

Contrato de administración aditivo: `GET/PUT /catalog/products/:id/pos-availability` con query outletId y body `{outletId,enabled}`; lectura products.read, escritura products.update. `GET/PUT /catalog/products/:id/commercial-tax` body `{rate,included}` con products.read/update. Se heredan a variantes; sin lista de precios ni impuesto distinto por sucursal en v1. `published`, slug, SEO y archivos continúan en las rutas actuales. Evitar reutilizar published como interruptor de POS.

### C2 — orden y líneas autoritativas

`POST /pos/v2/orders` body `{outletId,terminalId?,sessionId?,experience:"RETAIL"|"RESTAURANT",fulfillmentType,tableId?,guestCount?,notes?}`. RETAIL usa TAKEAWAY (enum existente), IN_STORE, sin mesa ni comensales; no añadir otro enum sólo para mostrador. RESTAURANT admite DINE_IN, TAKEAWAY, PICKUP, DELIVERY; DINE_IN puede operar sin plano. HYBRID exige experience explícita; experiencia no cambia contenedor de dinero. Se valida sesión/terminal/sucursal antes de crear. Moneda y política de impuestos se congelan desde contexto.

`POST /pos/v2/orders/:id/lines` body `{expectedVersion,productId,variantId?,quantity,modifiers?:[{optionId}],guestSeatId?,note?}`. `PATCH .../lines/:lineId` body `{expectedVersion,quantity?,guestSeatId?,note?}`. `DELETE .../lines/:lineId` exige expectedVersion en body. Todos devuelven orden completa. Servidor consulta precio/variantes/opciones, valida selección, calcula impuestos y snapshots en una sola transacción con recálculo. No aceptar unitPrice/taxRate/total del cliente como precios autorizados.

`POST .../lines/:lineId/discount` body `{expectedVersion,amount,reason}` requiere pos.discounts.apply. Descuento absoluto por línea entre cero y subtotal bruto; congelar base y razón/actor. No editar unitPrice mediante descuento implícito. Cambiar cantidad conserva precio/tasa original; refrescar precio exige comando explícito y auditable fuera de v1. No reprecificar órdenes históricas por cambio de Catálogo.

Orden DTO incluye campos actuales más `version,experience,currency,refundStatus,refundedAmount,netPaidAmount,remainingAmount,stockStatus,receiptId`; líneas incluyen IDs, snapshots actuales, `baseUnitPrice,priceVersion,taxIncluded,returnedQuantity`. paidAmount conserva importe bruto capturado para compatibilidad; refundedAmount separado. Cancelada y cerrada no muestran saldo cobrable aunque tengan ajustes históricos.

`GET /pos/v2/orders/:id` devuelve `{data:<OrderDTO>}`; `GET /pos/v2/orders?outletId=&status=&page=&pageSize=` devuelve lista paginada con los mismos campos (sin cargar líneas hasta detalle). page inicial 1, pageSize inicial 50 y máximo 100. version es entero creciente desde 1; refundStatus es NONE/PARTIAL/FULL; stockStatus es NOT_APPLIED/APPLIED/LEGACY_UNKNOWN. Toda escritura exitosa incrementa version; replay idempotente conserva la versión de la respuesta original. Ante ORDER_VERSION_CONFLICT, refrescar antes de decidir un nuevo intento lógico.

Regla de cálculo: redondear precio unitario a dos decimales; multiplicar por cantidad y redondear a dos; restar descuento; si taxIncluded, base=redondeo(importe/(1+tasa/100)), impuesto=importe-base; si excluido, impuesto=redondeo(base*tasa/100), total=base+impuesto. Orden suma líneas, nunca recalcula impuesto global sobre otra base. Sin propinas ni servicio automático en v1: campos existentes conservados, no aparentar que ya se calculan. Repartos de céntimos usan orden estable por ID de línea.

No modificar consumo/precio después del primer pago neto positivo ni después de envío a preparación: usar anulación de línea preparada auditada en C6 o devolución C4. Ediciones en paralelo y cualquier pago verifican expectedVersion bajo el mismo bloqueo. Transiciones financieras terminales nunca se revierten mediante enviar a cocina.

### C3 — cobro, reintentos y unidad transaccional

`POST /pos/v2/orders/:id/payments` requiere header `Idempotency-Key` (texto opaco 16–128, generado una vez por intento lógico, no un ID de entidad) y body:

```json
{
  "expectedVersion": 3, "paymentMethodId": "<metodo>",
  "amount": "100.00", "tenderedAmount": "200.00", "sessionId": "<sesion>",
  "reference": null, "allocations": []
}
```

Respuesta `{data:{payment:{id,amount,tenderedAmount,changeAmount,currency,sessionId,waiterShiftId,status},order:<OrderDTO>,receiptId}}`; ejemplo: amount=100, tendered=200, change=100. amount es lo aplicado al saldo, no el billete recibido; ingreso neto en caja es 100. tendered >= amount sólo para CASH; CARD/TRANSFER no admiten efectivo/cambio y exigen reference si el método lo requiere. Pagos parciales son válidos; nunca exceder remainingAmount. remainingAmount es autoritativo del servidor. Reintento devuelve la misma respuesta/IDs, no otro cobro ni un 409 de versión si el primer intento ya concluyó.

Clave única por empresa+operación+clave; guardar hash canónico de path/body y respuesta en la misma transacción. Misma clave con distinto body: 409 IDEMPOTENCY_CONFLICT. Mantener registro financiero sin expiración automática. Autorizar y verificar empresa incluso al reproducir respuesta. Si un fallo revierte todo, se puede repetir la misma clave; si hubo commit, recuperar respuesta. Nuevos comandos de órdenes, líneas, cancelación, devolución, cocina, stock, sesiones y recepción de cortes siguen la misma regla.

Dentro de la transacción: adquirir contenedor (sesión o turno) y luego orden; comprobar OPEN, empresa, sucursal, terminal cuando corresponda, expectedVersion y saldo; validar método; insertar pago; actualizar orden; efectuar stock al primer paso a PAID; generar recibo único; auditoría; guardar respuesta idempotente. Eventos realtime después del commit, nunca como condición para conservar el pago. Orden de bloqueos común: contenedor → orden → saldos comerciales ordenados por clave. Cierre bloquea contenedor antes de calcular suma; movimientos y pagos usan el mismo protocolo. Mantener CAS existente como verificación adicional. Turno creado/asegurado dentro del comando, no como efecto previo a fallar el pago.

Rutas antiguas de pago/cancelación/cierre también pasan por invariantes; sin clave idempotente se rechazan con 428 antes de escribir. Actualizar todos los consumidores SDK/hooks en etapa 1 con cambios de transporte exclusivamente, sin rediseño. No activar nuevos comandos con clientes que todavía inventen una clave por cada reintento. Lecturas legado siguen compatibles. Ningún lector puede marcar impreso o generar un cobro.

Integración con adquirente bancario no existe en el ámbito auditado: CARD/TRANSFER registra una captura declarada por operador, no procesa tarjetas. Si se agrega un proveedor, usar intento/outbox y confirmación del proveedor idempotente; no sostener un bloqueo SQL mientras se llama a una red externa.

### C4 — cancelación y devolución auditadas

`POST /pos/v2/orders/:id/cancel` body `{expectedVersion,reason}` y clave. Motivo obligatorio. Sólo si netPaidAmount=0, sin devolución pendiente y orden no PAID/REFUNDED. Con pagos parciales pendientes: 409 REFUND_REQUIRED, sin tocar pagos, stock o mesa. Orden y estado de mesa/cocina se actualizan atómicamente según referencias activas; no liberar una mesa con otra orden abierta.

`POST /pos/v2/orders/:id/refunds` body `{expectedVersion,reason,lines:[{orderLineId,quantity,restock}],payments:[{paymentId,amount,reference?}],sessionId}` con permiso pos.refunds.create y clave. Respuesta `{data:{refund:{id,status:"COMPLETED",amount,currency,lines,payments},order:<OrderDTO>,receiptId}}`. Motivo no vacío; cantidad <= vendido menos devuelto; importe calculado por snapshots, descuentos e impuestos originales, con diferencia de redondeo asignada al último tramo. Distribución a pagos no excede cada captura menos devoluciones previas. Método se hereda de pago original, no se escoge un pago inventado.

Devolución de anticipo en orden aún abierta: lines=[]; importes explícitos hasta netPaidAmount, sin stock, motivo obligatorio. Tras recuperar todo el anticipo se permite cancelar, conservando pagos y devoluciones. En venta cerrada, exige líneas y su suma debe coincidir con payments. PAID con devolución parcial conserva PAID y refundStatus=PARTIAL; devolución total establece REFUNDED y refundStatus=FULL. No reabre saldo de venta cerrada. paidAmount bruto nunca se borra ni se reemplaza por cero.

Cada devolución es un documento inmutable con líneas y vínculos a pagos; no borrar pagos ni poner toda captura REFUNDED para representar una devolución parcial. En CASH se registra salida en la sesión abierta seleccionada de la misma sucursal, incluso si la sesión original ya cerró; no reabrir el corte histórico. La salida genera un único movimiento REFUND_OUT vinculado al documento; fórmula de caja lo resta una sola vez. No usar simultáneamente reducción de captura histórica y movimiento OUT. CARD/TRANSFER en v1 requieren referencia de devolución externa registrada por operador; resultado automático del banco queda fuera del alcance. Datos de referencia no incluyen credenciales de pago.

Stock sólo se repone si existió salida comercial vinculada y restock=true. Producto consumido/preparado puede tener restock=false; se registra la decisión y actor. La devolución financiera de una orden histórica sin salida registrada nunca crea inventario ficticio. Todas las acciones y sus compensaciones quedan enlazadas en auditLog.

### C5 — stock comercial único y compatibilidad

Un solo servicio de Catálogo admite `tx` para ajustes, salida POS y devolución. Cada movimiento agrega outletId (nullable sólo para legado), sourceType, sourceId, sourceLineId, operationKey y reversalOfId. Índice único por empresa+operationKey asegura que cada salida/reversa se aplica una vez; el id de entidad sigue siendo generado por DB. No hacer transacción anidada desde pago.

Mantener stock agregado de producto SIMPLE o variante como proyección compatible. Crear saldos por sucursal como partición de ese mismo total, más un saldo explícito LEGACY_UNALLOCATED por artículo. Migración copia el saldo actual una sola vez a ese bucket, sin fabricar movimientos históricos ni asignarlo a la primera sucursal. Asignación explícita a sucursal transfiere dentro del total, sin sumar inventario. Nuevos saldos y agregado se actualizan en la misma transacción; conciliación exige agregado = suma de ubicaciones. Padre VARIABLE no es otro saldo vendible ni se suma con variantes.

No inferir stock inicial de ventas históricas: los saldos actuales pueden haber sido ajustados manualmente. No descontar retroactivamente órdenes PAID. Salida en transición nueva a PAID con movimiento único por línea; devoluciones referencian ese movimiento. Si trackStock=false no hay restricción de saldo ni salida; si true, cantidad entera y saldo suficiente en outlet, actualización condicional/bloqueo evita negativo. V1 no permite sobreventa ni reserva de stock; dos carritos pueden contener la última pieza, sólo uno termina pago. Stock se valida antes de registrar la captura declarada; no dar por cobrado a quien recibe INSUFFICIENT_STOCK.

`GET /catalog/products/:id/stock-balances` devuelve `{data:[{outletId,scope:"OUTLET"|"LEGACY_UNALLOCATED",variantId,quantity}]}`; `POST .../stock-allocations` body `{variantId?,outletId,quantity,reason}` transfiere desde legado; `POST .../stock-movements` conserva API existente y agrega outletId e Idempotency-Key. Balance: products.read; asignar/ajustar: inventory.adjust (conservar compatibilidad explícita products.update actual durante transición). Nuevas operaciones no aceptan `stock` por PATCH general; usar ajuste auditado. Creación inicial con stock se traduce a un ajuste explícito en bucket legado en la misma transacción. No crear una segunda ruta que eluda el libro.

### C6 — Restaurante, mesas simples y preparación

`GET /pos/v2/tables?outletId=` devuelve `{data:[{id,name,capacity,status,activeOrderId,floorId}]}` sin requerir layout publicado. `POST /pos/v2/tables` body `{outletId,name,capacity}` crea mesa sin floorId, permiso pos.floor.manage o pos.admin.update. Adaptar FK floorId a nullable y agregar outletId; backfill desde floor existente, nunca mover mesas entre empresas. Mesas existentes conservan IDs y plano. Canvas consume las mismas mesas cuando se vinculan; no se crea un salón oculto que obligue a usar planner.

`GET /pos/v2/orders/:id/seat-totals` devuelve `{data:{seats:[{id,label,totalAmount,paidAmount,remainingAmount,lineIds}],orderTotal,paidAmount,remainingAmount}}`. C3 `allocations` contiene `{orderLineId,amount}` y servidor verifica pertenencia, suma e importe no asignado; asiento es agrupación de esas líneas, no otro sistema de órdenes. Pagos sin asignación se muestran como generales; asignarlos usa comando auditable `POST .../payment-allocations` con `{expectedVersion,paymentId,allocations}` y clave, sin cambiar dinero. La suma por línea no supera su importe y la suma de asignaciones no supera cada pago neto. Después de devolución se reduce atribución por líneas afectadas. Repetir «cobrar asiento» ya pagado devuelve conflicto sin captura.

`POST /pos/v2/orders/:id/kitchen-dispatches` body `{expectedVersion,lineIds}` y clave; devuelve `{data:{dispatchId,tickets:[{id,stationId,status,lineIds}],skippedLineIds}}`. Sólo nuevas cantidades/líneas preparables no enviadas, nunca PAID/CANCELLED/REFUNDED; reintentos no duplican tickets. Sin estaciones de esa sucursal y KDS/print desactivados: registro manual explícito sin ticket, skippedLineIds informado. Si preparación configurada activa y falta estación válida: 409 PREPARATION_STATION_REQUIRED. No inferir estaciones de otra sucursal. Modificadores y notas son snapshots del envío.

`GET /pos/v2/kitchen/tickets?outletId=&stationId=&status=` devuelve tickets con líneas, nombres, notas, modificadores y version. `PATCH .../tickets/:ticketId/lines/:lineId` body `{expectedVersion,status}` con clave, permiso cocina. Secuencia PENDING→IN_PREPARATION→READY→DELIVERED; CANCELLED sólo por comando autorizado con motivo. Estado de ticket se deriva de líneas: todas canceladas CANCELLED; todas terminales y alguna entregada DELIVERED; todas READY/terminales READY; alguna iniciada IN_PREPARATION; resto PENDING. Cambios de orden derivados de preparación no pisan PAID/CANCELLED/REFUNDED.

`POST /pos/v2/orders/:id/lines/:lineId/void-preparation` body `{expectedVersion,reason}` requiere orders.cancel y clave: sólo antes del primer pago; anula línea y pendientes de cocina, conserva rastro y recalcula orden. Si cocina ya consumió producto, registra merma administrativa separada, no inventa una salida POS pagada. V1 no edita cantidad de línea ya enviada; agregar otra línea/envío para extras.

Floor Planner es opcional en navegación avanzada. Ninguna apertura de caja, pedido o mesa simple exige dibujar. Estaciones y configuración de preparación se conservan. Reservas existentes permanecen compatibles y se prueban al cambiar relación de mesa.

### C7 — recibo e impresión verificable

El pago completo y la devolución crean un `PosReceipt` inmutable con snapshot y número único. `GET /pos/v2/receipts/:id` entrega documento/estado sin imprimir ni aumentar contadores. `POST /pos/v2/receipts/:id/print-jobs` body `{transport:"BROWSER"|"BLUETOOTH",reason?}` y clave crea intento, respuesta `{data:{jobId,receiptId,status:"QUEUED",payload}}`. Adaptador frontend usa capacidades compartidas del dispositivo; no modifica importes. `POST .../print-jobs/:jobId/result` body `{status:"SUBMITTED"|"FAILED",errorCode?}` guarda respuesta del transporte y auditoría. SUBMITTED no acredita papel físico; sólo ack real de hardware permite CONFIRMED en una futura capacidad específica. printedCount aumenta sólo en confirmación soportada, no por insertar intento o abrir diálogo del navegador.

Reimpresión crea intento vinculado al mismo comprobante/folio, marcado copia; no factura otra venta. Fallo de impresora no revierte pago y permite recuperar recibo sin volver a cobrar. Navegador permite previsualizar/imprimir mediante diálogo; cancelación no afirma impresión. KDS y recibo de venta son documentos distintos; cocina impresa usa el mismo mecanismo de intentos referenciando dispatchId/ticketId. No prometer certificación fiscal/CFDI: el ticket aquí es comprobante comercial.

Para cocina: `POST /pos/v2/kitchen/tickets/:ticketId/print-jobs` acepta el mismo body de transporte y devuelve el mismo DTO job; `POST /pos/v2/print-jobs/:jobId/result` acepta el resultado para ambos tipos de documento (la ruta anidada bajo recibo es alias). Ambos validan empresa/sucursal del documento; lectura/reimpresión de recibo requiere acceso a la orden, y ticket requiere acceso cocina. Resultado sólo lo registra el actor que creó el intento o un administrador autorizado; validar transición QUEUED→SUBMITTED/FAILED y replay, sin aceptar CONFIRMED arbitrario desde el cliente.

### C8 — caja y cortes

`POST /pos/v2/sessions/open` `{outletId,terminalId,openingCashAmount,notes?}`; `GET .../sessions/:id/expected-cash`; `POST .../sessions/:id/close` `{countedCashAmount,notes?}`; `POST .../sessions/:id/cash-movements` `{kind:"IN"|"OUT",amount,reason}`. Escrituras con clave. DTO sesión conserva campos actuales e incluye desglose cashSales,refundOut,cashIn,cashOut,waiterDeliveries y differenceAmount.

Esperado = fondo + capturas CASH propias + entradas − salidas + entregas WAITER_DELIVERY − REFUND_OUT. No sumar tarjetas ni billete bruto ni capturas de mesero ya representadas por entrega. Sesión cerrada es snapshot inmutable; vista previa OPEN no equivale a cierre confirmado.

`GET /pos/v2/waiter-shifts?outletId=&status=`; `POST .../waiter-shifts/:id/close` `{sessionId,deliveredAmount,notes?}` con clave. Turno, entrega y audit se confirman en una transacción, sesión destino OPEN de misma sucursal. Concurrencia con pago de mesero se serializa sobre turno; cierre contra recepción repetida devuelve misma respuesta. Diferencia entre efectivo esperado y entregado se conserva para auditoría, nunca se borra para cuadrar visualmente. Nuevos índices únicos parciales de sesión OPEN por empresa+terminal y turno OPEN por empresa+outlet+mesero; duplicados históricos se reportan, no se cierran automáticamente.

## 6. Datos mínimos y estrategia de compatibilidad

| Cambio futuro | Motivo y estrategia |
|---|---|
| `pos_order`: version, experience, currency y snapshot fiscal; `pos_order_line`: baseUnitPrice, taxIncluded, priceVersion | Aditivos. Version inicial 1. Histórico con moneda no demostrable queda nullable y DTO historicalCurrencyUnknown=true: consultar sí, nuevas operaciones monetarias bloqueadas hasta conciliación explícita. No rellenar MXN/USD por default actual. experience histórica sólo se completa con evidencia, no por DINE_IN defectuoso. |
| `pos_payment`: tenderedAmount/changeAmount; tabla de idempotencia de comandos | Históricos recibido/cambio null, sin afirmar «efectivo exacto». Clave única, hash y respuesta duradera; no migrar todos los pagos a claves ficticias para deduplicarlos. |
| Documento devolución + líneas + vínculos a capturas + asignaciones de pago a líneas | Nuevas entidades core relacionadas, sin borrar capturas. Índices empresa/orden/pago y checks de positivos. Límites acumulados validados bajo bloqueos. |
| Producto: tasa/inclusión fiscal nullable, version de precio; disponibilidad POS por producto+sucursal | Baseline desde configuración global actual; snapshot en orden impide cambios históricos. Tabla de política por outlet con unique empresa+producto+outlet; ausencia hereda baseline explícito. Impuestos catálogo heredan settings POS hasta configurarse. No introducir recetas/BOM/CRM/ecommerce nuevo. |
| Movimientos comerciales extendidos + saldos por ubicación | Columna origen nullable legado, nuevas operaciones requieren origen. Uniques parciales para variantId null y para bucket legado (NULL en índice compuesto no garantiza unicidad). FKs verifican empresa y producto/variante/ubicación. Saldos enteros v1; fraccionarios controlados se rechazan, no redondean. |
| `pos_table.outletId`, floorId nullable | Backfill desde piso. Mesas simples sin geometría, renderer ignora las que no tienen elemento hasta vincularlas; los planos actuales no cambian. |
| Envío cocina con identidad, versión y líneas enviadas; print jobs | Evita duplicar preparación e inventar confirmaciones de impresión. Mantener tickets actuales legibles; no reenviar automáticamente legado por falta de dispatchId. |
| Índices parciales OPEN y auditoría dentro del comando | Preflight de duplicados; no se instala índice sobre datos incompatibles sin plan de conciliación. Conservar CHECK de contenedor legado y completar validación sólo después de resolver filas antiguas. |

Los nombres físicos finales y SQL se documentarán en migraciones nuevas revisables de etapa 1/2. No editar migraciones aplicadas ni correr reset/seed/purge. Expandir primero, backfill idempotente con conteos y excepciones, activar por empresa después de verificación. Stock, impuestos o moneda ambiguos impiden habilitar la nueva operación; nunca se corrigen con un UPDATE masivo basado en conjeturas.

Antes de activar Tienda deben estar cerradas etapas 1 y 2: pagos nuevos de productos controlados permanecen bloqueados mientras no exista saldo asignado y servicio de stock compartido. El gate impide publicar una fase monetaria a medias. Rollback operativo deshabilita comandos v2 y mutaciones legado incompatibles, conserva lectura y documentos; no vuelve a un escritor antiguo que omita stock, refunds o claves. Las nuevas tablas permanecen para recuperar y conciliar.

## 7. Verificación realmente ejecutada

Entorno local: Node `v22.23.3`, pnpm `9.15.0`. No se levantó API ni navegador ni se conectó PostgreSQL. Resultados del 2026-11-01:

| Comando | Resultado comprobado |
|---|---|
| `node --test --test-reporter=spec` con los 7 archivos de `apps/api/src/routes/pos/__tests__/*.test.js`, los 4 de `apps/api/src/routes/catalog/__tests__/*.test.js` y `apps/api/src/manifests/official/__tests__/runly-pos-contract.test.js` | Exit 0; 88 tests, 20 suites, 88 pass, 0 fail, 0 skip; duración reportada 14310 ms. |
| `node --test --test-reporter=spec apps/desktop/src/modules/runly.pos/lib/plannerObjects.test.js apps/desktop/src/modules/runly.pos/lib/floorObjects.test.js` | Exit 0; 7 tests, 2 suites, 7 pass, 0 fail, 0 skip; 207 ms. |
| `pnpm check:privacy` antes de crear documentos | Exit 1; 6420 archivos, 67 hallazgos de política preexistentes fuera del alcance. Valores no copiados. No son fallos de las pruebas POS. |

Total funcional ejecutado: **95 pruebas aprobadas**, sin nuevas pruebas de implementación en una entrega documental. POS+manifest: 69; Catálogo: 19; adaptadores Canvas/POS: 7. Cobertura real: mocks de servicios, validadores, permisos de stock, proyección pública, manifiesto y adaptadores puros. La prueba de conflicto de pago simula updateMany.count=0; los mocks `$transaction(fn) => fn(prisma)` no acreditan rollback SQL ni dos conexiones concurrentes.

Existe `apps/api/src/services/__tests__/user-isolation.integration.test.js`, con casos POS de referencias cruzadas y reservas; requiere opt-in `RUNLY_ISOLATION_TEST_DATABASE_URL` de base desechable. No ejecutada: crea y limpia fixtures; no se verificó destino desechable y esta ejecución no opera sobre datos. No reportarla como aprobada ni como cobertura concurrente financiera. No se midió porcentaje de líneas/branches. No hay evidencia de venta táctil completa, escáner real, proveedor bancario, corte concurrente o papel impreso.

La verificación final de documentos y privacidad del cambio se registra en el plan. El gate global de privacidad permanece pendiente; no ampliar el alcance modificando avisos legales, Notes, Studio o automatizaciones para ocultar el resultado.

## 8. Criterio de contrato cerrado y entrega a Claude

Esta especificación fija recorridos, DTO, endpoints objetivo, permisos, reglas de cálculo, stock, devoluciones y errores. Cambios posteriores requieren revisar contrato y pruebas asociadas antes de tocar UI. No queda a criterio de interfaz inventar precio, impuesto, cambio, estado de pago, disponibilidad o confirmación de impresión.

Entrega por contrato exige: fixture JSON válido, schema Zod, método SDK, prueba de ruta con permisos, prueba de servicio y evidencia DB para operaciones financieras. Codex publica en el repositorio la lista de contratos implementados y pruebas; Claude consume únicamente esos contratos y reutiliza `PageHeader`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `RunlyTable`, `Dialog/Sheet`, campos y archivos de `@runly/ui`. No reescribir componentes compartidos ni Canvas para resolver defectos monetarios.

Primera etapa técnica lista para ejecutar: **1, Integridad operativa**, comenzando por T01/T02/T03/T07/T12/T16/T17/T20/T21/T22 y migraciones aditivas con preflight local. El diseño de Tienda se puede implementar cuando estén disponibles C0–C5/C7/C8 y haya gate de stock de etapa 2 satisfecho. Restaurante añade C6. La autorización actual termina en estos dos documentos.
