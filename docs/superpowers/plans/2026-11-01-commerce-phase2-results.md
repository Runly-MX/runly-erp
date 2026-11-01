# Runly Commerce Recovery — cierre de fase 2

Fecha: 2026-11-01. Alcance: backend de Catálogo, C1/C5 e integración de stock con el núcleo financiero aprobado. **Apta técnicamente para integración local de Claude.** No acredita interfaz integrada, instalación productiva ni fases 3–4.

## Revisión y commits locales

- Base inicial `13c82e874`, rama `main`, árbol limpio antes de modificar código. Se verificaron como ancestros `580b1331b`, `9882695b7` y `13c82e874`; también se conservan las bases anteriores del plan. No se detectaron cambios ajenos ni se modificaron pantallas React, prototipos o especificaciones aprobadas.
- Commit final de implementación: **`da2b497d9d8fc9385330934d902eb91f300cf47e`**, `feat(commerce): recover catalog and branch stock contracts`.
- Este único informe se incorpora en un commit documental posterior. Su identificador exacto se obtiene con `git log -1 --format=%H -- docs/superpowers/plans/2026-11-01-commerce-phase2-results.md`; no se incluye un hash autorreferencial. Tras ambos commits el árbol queda limpio, verificado al entregar.
- Trabajo exclusivamente local: sin SSH, push, despliegue, sync de instalación ni modificación de bases existentes. PostgreSQL se creó y eliminó dentro del contenedor desechable propiedad del runner.

## Cambios implementados

C1 dispone de una consulta comercial propia; POS no depende del listado administrativo genérico. Incluye productos simples y variables, selección inequívoca de variante, búsqueda parcial por nombre/SKU/barcode del producto o SKU/barcode de variantes, categoría, paginación y escaneo exacto. La búsqueda de variantes devuelve el padre una sola vez; scan devuelve la variante concreta. Los códigos duplicados históricos producen ambigüedad, sin imponer una unicidad nueva.

La disponibilidad combina producto/variante activos, baseline POS, política de sucursal, moneda y stock local. `published` continúa controlando web exclusivamente. Una excepción de sucursal puede habilitar o deshabilitar el baseline; `enabled:null` restablece herencia. Las variantes heredan la política del producto, conservando como bloqueo las configuraciones antiguas `availableInPos:false`; el GET administrativo devuelve sus IDs. `requiresPreparation` conserva la configuración existente.

Precio numérico de variante, incluido cero, sigue siendo fijo. **`price:null` opta por heredar del producto**; omitir precio al crear conserva el cero fijo anterior y omitirlo al editar conserva la política anterior. La herencia también se resuelve en lecturas administrativas y públicas existentes. El impuesto del producto hereda de POS cuando ambos campos son null. Las versiones de precio y los snapshots fiscales se guardan al agregar una línea; modificar Catálogo no cambia órdenes anteriores. Los cálculos financieros existentes se mantienen; preview y devolución usan la misma función de prorrateo del servidor.

El listado administrativo conserva su contrato y suma búsqueda SKU/barcode, proyección barcode, alias `category_id` y filtro `posAvailable` acompañado de `outletId`. Ese filtro representa **habilitación del canal**, mientras stock y moneda se expresan en C1. Las referencias de producto/variante/categoría y archivos se restringen a la empresa; las operaciones sobre hijos comprueban también el producto de la URL. Se corrigió la validación de `option_values` para Zod 4.

## Contratos disponibles para Claude

Todas las rutas requieren identidad y empresa activa; las nuevas rutas comerciales usan error `{error:{code,message},requestId}`. No se acepta empresa en el body. IDs son UUID, importes son cadenas con dos decimales, tasas con cuatro y cantidades de stock son enteros. Las lecturas históricas de las rutas anteriores conservan sus envolturas existentes.

| Contrato / ruta real | Entrada y respuesta | Permiso |
|---|---|---|
| C1 `GET /pos/v2/sellables` | `outletId` obligatorio; `categoryId?`, `search?`, `page=1`, `pageSize=50`, máximo 100. `{data:Sellable[],pagination:{page,pageSize,total,hasMore}}`, orden nombre,id | OR de `pos.terminal.use`, `pos.caja.read`, `pos.caja.operate`, `pos.comandas.read`, `pos.comandas.create` |
| C1 `GET /pos/v2/categories` | `outletId`; `{data:[{id,name,parentId,position}]}`, orden position,name,id | Mismo OR operativo |
| C1 `GET /pos/v2/sellables/:id/variants` | `outletId`; `{data:Sellable[]}` con `productId` y `variantId` | Mismo OR operativo |
| C1 `GET /pos/v2/scan` | `outletId`, `code`; `{data:{matches:Sellable[],ambiguous}}`. Barcode exacto primero, después SKU exacto sin distinguir mayúsculas; preserva ceros iniciales | Mismo OR operativo |
| C1 admin `GET/PUT /catalog/products/:id/pos-availability` | GET `outletId?`: baseline, sucursales enabled/inherited, disabledVariantIds. PUT `{outletId?,enabled}`; null para heredar sólo con sucursal | `catalog.products.read` / `catalog.products.update` |
| C1 admin `GET/PUT /catalog/products/:id/commercial-tax` | GET override y effective. PUT `{rate,included}`; ambos null para heredar, tasa 0–100 | `catalog.products.read` / `catalog.products.update` |
| C5 `GET /catalog/products/:id/stock-balances` | `variantId?`, `outletId?`; `{data:[{id,companyId,productId,variantId,outletId,scope,quantity,updatedAt,outletName}]}` | `catalog.products.read` |
| C5 `POST /catalog/products/:id/stock-allocations` | `{variantId?,outletId,quantity,reason}`. Cantidad positiva; `{data:{movements,balances}}` | `catalog.inventory.adjust` OR `catalog.products.update` |
| C5 `POST /catalog/products/:id/stock-movements` | `{variantId?,outletId,quantityDelta,reason,note?}`. Delta no cero; mismo resultado. Se aceptan alias anteriores `variant_id` y `quantity_delta` | Mismo OR de ajuste |
| C5 `GET /catalog/products/:id/stock-movements` | `variantId?`, `outletId?`, `limit` máximo 200, `offset`; `{data,total}`. Origen, reversalOfId, balanceApplied, actorName, sourceLabel, orderId/orderNumber; conserva alias snake_case de lectura | `catalog.products.read` |
| D29 `POST /pos/v2/orders/:id/refunds/preview` | `{expectedVersion,lines:[{orderLineId,quantity,restock}],amount?}`; amount sólo para anticipo sin líneas. `{data:{orderId,expectedVersion,currency,lines,totalAmount,subtotalAmount,taxAmount,payments}}` | `pos.refunds.create` |

Cada escritura C1/C5 exige **`Idempotency-Key` de 16–128 caracteres ASCII visibles**, razón donde corresponde y respuesta persistente. Repetir misma clave/body devuelve el resultado confirmado; cambiar body con esa clave falla. Preview es lectura sin efectos, sin clave, sin reservar dinero o stock. Al confirmar se revalidan versión, límites y pagos; hay que enviar sólo propuestas con importe positivo y agregar las referencias exigidas para devoluciones externas. No calcula dinero autoritativo el cliente.

Sellable contiene `id`, `productId`, `variantId`, `productType`, `name`, `categoryId`, `categoryName`, `optionValues`, `variantLabel`, `sku`, `barcode`, `price`, `currency`, `priceInherited`, `priceVersion`, `tax:{rate,included}`, `requiresVariant`, `trackStock`, `stock`, `unallocatedStock`, `stockState`, `available`, `unavailableReason`, `unavailableMessage`, `requiresPreparation`, `imageUrl`. Padre VARIABLE tiene stock null y precio mínimo informativo de variantes disponibles; no puede venderse sin variante. Inactivos se excluyen del listado normal y permanecen explicados en scan/variantes.

Estados stock: `UNTRACKED`, `AVAILABLE`, `UNALLOCATED`, `OUT_OF_STOCK`. Motivos no vendibles: `DISABLED`, `NOT_AVAILABLE_AT_OUTLET`, `CURRENCY_MISMATCH`, `NO_ACTIVE_VARIANT`, `OUT_OF_STOCK_AT_OUTLET`. Los saldos históricos negativos se muestran como tales en C5 y se concilian explícitamente. Errores operativos incluyen `INSUFFICIENT_STOCK`, `RECONCILIATION_REQUIRED`, `VARIANT_REQUIRED`, `ORDER_VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `CONFIGURATION_REQUIRED`; sin clave, 428 `IDEMPOTENCY_REQUIRED`. Se mantienen los errores financieros de fase 1. Un error inesperado entrega 500 sin filtrar SQL ni datos internos.

SDK real:

- `client.commerce.sellables(query,token)`, `categories(query,token)`, `variants(id,query,token)`, `scan(query,token)`, `refundPreview(id,body,token)`.
- `client.catalogCommerce.stockBalances`, `stockMovements`, `allocateStock`, `adjustStock`, `availability`, `setAvailability`, `commercialTax`, `setCommercialTax`. Firmas en `packages/sdk/src/domains/catalog-commerce.js`; escrituras reciben `{idempotencyKey}` como último argumento. El SDK conserva empresa activa y no encola estos comandos offline.
- `client.catalog` y C0/C2/C3/C4/C8 permanecen disponibles. El escritor antiguo de stock debe migrar a `catalogCommerce`: omitir sucursal o clave deja de ser admisible por el contrato C5 aprobado. PATCH general de stock falla; la ruta anterior de movimientos queda atendida por el libro nuevo. Los exports existentes siguen leyendo el historial.

## Reglas de stock y compatibilidad

1. `CatalogStockBalance` particiona el mismo agregado anterior en sucursales y `LEGACY_UNALLOCATED`. Producto SIMPLE y variante mantienen su agregado compatible; el stock raíz antiguo de un VARIABLE se preserva, pero no es otro artículo vendible ni se suma a variantes.
2. Migración `20261101180000_commerce_catalog_stock` aditiva: copia saldos actuales a «Sin asignar» sin adjudicar sucursal ni fabricar movimientos históricos. `commerce_initialize_stock_balances()` se ejecutó dos veces sin duplicar unidades o historial. La migración completa se aplica una vez mediante el registro normal de migraciones. Se preservan saldos negativos, IDs, órdenes PAID, pagos, sesiones y archivos anteriores.
3. Asignar transfiere mediante dos movimientos ligados al intento, resta del bucket anterior y suma a sucursal: variación agregada cero. Nunca permite asignar más de lo disponible. El saldo negativo anterior requiere conteo/corrección auditada; `outletId:null` explícito en ajuste identifica ese bucket. No se reduce aún más un saldo negativo; puede corregirse gradualmente hacia cero. No existe asignación automática.
4. Nuevos artículos con stock inicial generan bucket y movimiento `OPENING_BALANCE` en la misma transacción SQL; el origen identifica el artículo y el actor es sistema. Los ajustes administrativos requieren motivo/actor. Las escrituras directas al stock agregado se rechazan en API, sync y trigger SQL; el agregado sólo sigue las diferencias del libro.
5. Carrito no reserva. Antes de cada captura se validan cantidades agrupadas por artículo/variante y stock suficiente de la sucursal. **Sólo la transición nueva a PAID descuenta**, con una salida `POS_SALE` por línea; los parciales no descuentan. El bloqueo por empresa/artículo/variante y el índice único de operationKey impiden sobreventa y duplicación. Los locks de varios artículos se toman en orden estable.
6. Pago, proyección agregada, saldo local, movimiento, recibo, auditoría y respuesta idempotente confirman o revierten juntos, sin transacción anidada. No se modifican `InvItem`, códigos físicos ni `runly.inventory`.
7. Devolución repone sólo unidades enteras de una salida comercial aplicada y de la misma sucursal, referenciándola con `reversalOfId`; limita acumulados y marca `stockRestored` real. `restock:false` conserva la salida. Venta histórica sin salida demostrable devuelve dinero sin inventar stock; origen antiguo no conciliado bloquea reposición con `RECONCILIATION_REQUIRED`. No se descuentan retroactivamente ventas PAID anteriores.
8. Moneda, impuesto y precio de órdenes existentes se conservan. Nuevos campos usan defaults compatibles: variantes anteriores siguen con precio fijo y movimientos anteriores con balanceApplied=false. Nuevas tablas tienen RLS, revocación de accesos públicos y validación SQL de referencias de empresa/producto/variante/sucursal; índices tratan NULL explícitamente. PostgreSQL mínimo para ese índice: 15; entorno probado: 18.

Ante reversión operativa, conservar la expansión y bloquear escrituras; no reinstalar un escritor que ignore el libro o las devoluciones. No se realizaron cambios destructivos de datos ni reconciliaciones de una instalación real.

## Fixtures consumibles

Los fixtures reproducibles viven en `apps/api/src/routes/catalog/__tests__/commerce-phase2-postgres.test.js`: dos empresas, dos sucursales, terminales/sesiones distintas, simple con saldo anterior, variantes fija/heredada, 501 productos, códigos ambiguos y moneda incompatible. IDs los genera PostgreSQL; los siguientes fragmentos muestran valores comprobados, omitiendo sólo los IDs dinámicos y campos descriptivos repetidos.

```json
{
  "scanSinAsignar": {
    "sku": "CAFE", "barcode": "000123", "categoryName": "Bebidas",
    "variantLabel": null, "stock": 0, "unallocatedStock": 5,
    "stockState": "UNALLOCATED", "available": false,
    "unavailableReason": "OUT_OF_STOCK_AT_OUTLET",
    "unavailableMessage": "Hay existencias «Sin asignar»; asígnalas a esta sucursal."
  },
  "varianteHeredada": {
    "sku": "CAFE-L", "barcode": "00222", "variantLabel": "Grande",
    "price": "100.00", "priceInherited": true, "currency": "MXN"
  },
  "previewUnaDeDosUnidades": {
    "totalAmount": "100.00", "subtotalAmount": "100.00", "taxAmount": "0.00",
    "payments": [{"kind": "CASH", "amount": "100.00", "maxRefundable": "200.00", "requiresReference": false}]
  }
}
```

Para la prueba fiscal, precio 116 con 16% incluido congela subtotal 100 e impuesto 16; después de cambiar Catálogo a 200, preview de media unidad no controlada conserva total 58 e impuesto 8. Para una unidad controlada, devolver 0.5 se rechaza incluso con restock=false.

## Pruebas ejecutadas y aceptación

| Verificación final | Resultado |
|---|---|
| `node scripts/test-commerce-postgres.mjs` | **150/150**, 28 suites, cero fallos/skips. Incluye 13 escenarios nuevos PostgreSQL fase 2 y los 15 escenarios PostgreSQL de fase 1, regresiones de Catálogo público/stock/export, manifiesto, sync, SDK y adaptadores anteriores |
| Migraciones en PostgreSQL 18 desechable | Esquema sintético previo + migración fase 1 + fase 2; conserva historia financiera y stock, duplica inicialización sin duplicar saldos; comprueba preflight histórico y RLS/revocaciones de fase 1 |
| `node --test packages/sdk/src/__tests__/*.test.js` | **81/81**, sin fallos/skips |
| `pnpm exec prisma validate` y generación del cliente | Correctas |
| ESLint de archivos Catálogo/POS/SDK afectados y pruebas nuevas | Correcto |
| `pnpm check:uuid-policy` | Correcto |
| `pnpm rbac:verify-catalog` | 349 permisos, cero faltantes/sobrantes |
| `git diff --check` | Correcto |
| `pnpm check:privacy` | Exit 1: **67 hallazgos previos**, mismo total que fase 1, fuera de esta entrega. Revisión individual de los 34 archivos de implementación: **cero hallazgos**; informe revisado por separado sin hallazgos |

Los 15 criterios solicitados quedan comprobados:

| Casos | Evidencia de integración |
|---|---|
| 1–2 simple controlado / variante específica | Salida real al completar cobro; otra variante y raíz VARIABLE permanecen intactas |
| 3–5 barcode / SKU y nombre / categoría paginada | Barcode exacto conserva 000123; SKU sin distinguir mayúsculas; datos y count concordantes; artículo 501 accesible en página 6 |
| 6–7 publicado web sin POS / diferencia por sucursal | Deshabilitado en Centro, vendible en Norte; published no cambia |
| 8–9 insuficiencia / última unidad concurrente | Dos clientes y sesiones distintas: una venta termina, otra falla INSUFFICIENT_STOCK, sin captura ni saldo negativo; líneas repetidas se agrupan |
| 10–11 retry / pagos parciales | Retry persistente no repite salida; parcial 20 no descuenta, final 80 descuenta una vez |
| 12 refund / retry | Preview sin efectos, devolución parcial repone una vez; retry concurrente devuelve misma respuesta, folio/actor y reversalOfId comprobados |
| 13 asignación histórica | Transferencia pareada conserva total; retry no duplica; insuficiencia revierte; corrección negativa explícita auditable |
| 14 precio histórico | Cambio posterior de precio conserva importe/tasa de la orden y preview; herencia de variante también funciona en lecturas antiguas |
| 15 aislamiento / permisos | Empresa/sucursal ajenas y variante fuera de ruta bloqueadas; operador de Caja lee C1 sin administración; stock exige permiso granular; captura/devolución conserva controles de contenedor de fase 1 |

Además se fuerza fallo de auditoría tras la operación: no quedan pago, movimiento, cambio de agregado ni respuesta de intento; reintentar confirma correctamente. Se prueban HTTP real del router/SDK, clave ausente 428, PATCH stock 400, preview HTTP y error de permiso estructurado. El middleware de identidad de pruebas usa fixtures: no se certifica login real ni la configuración de roles de un despliegue. La prueba de fase 1 conserva deuda 100/recibido 200/aplicado 100/cambio 100, cancelación protegida y concurrencia financiera.

La evidencia no incluye toda la historia de migraciones de la plataforma, Supabase Auth de una instalación, navegador, dispositivo táctil, banco o impresora física. No se midió cobertura global. Esas verificaciones no se presentan como aprobadas.

## Clasificación D01–D30

El registro UX vigente tiene 21 entradas numeradas; no contiene D02, D04, D08, D09, D13–D16 ni D19. Se registra su ausencia en vez de inventar requisitos.

| Discrepancia | Fase y estado al cierre |
|---|---|
| D01 suspender/reanudar | Fase 3, C2/listado; pendiente |
| D03 búsqueda/admin POS | Fase 2; resuelta búsqueda, barcode, alias categoría y filtro habilitación POS+sucursal |
| D05 resumen de cuentas | Fase 4, proyección restaurante; pendiente |
| D06 realtime | Fase 4, C6; pendiente |
| D07 vista previa de ticket | Fase 3/C7, cocina fase 4; pendiente |
| D10 disponibilidad general y sucursales | Fase 2; resuelta, incluida herencia y bloqueo legado por variante |
| D11 edición de modo de sucursal | Fase 5, administración; lectura C0 anterior preservada |
| D12 resumen/mesas propias | Fase 4, C6; pendiente |
| D17 origen de movimientos | Fase 2; resuelta fuente, sucursal, orden/folio, actor y reversa; enlace visual corresponde a Claude |
| D18 experiencia predeterminada | Opcional fases 3/5; no se añadió preferencia persistida |
| D20 deshacer KDS | Fase 4, C6; pendiente |
| D21 orden categorías | Fase 2; resuelta por position,name,id y probada |
| D22 conteo ciego | Integración de cierre fase 3 y preferencia fase 5; esperado sigue siendo lectura opcional, sin preferencia nueva |
| D23 pedir cuenta | Fase 4, C6; pendiente |
| D24 pre-cuenta impresa | Fase 4/C7; pendiente |
| D25 códigos convencionales | REFUND_REQUIRED de fase 1 conservado; preparación/estaciones pertenece a fase 4, sin reescribir la especificación |
| D26 tarjeta de cocina | Fase 4, C6; pendiente |
| D27 resultados de escaneo | Fase 2; resuelta con SKU, categoría, variante y motivos estructurados |
| D28 historial de órdenes | Fases 3/5, C2; pendientes filtros/proyección adicionales |
| D29 preview parcial | Resuelta en fase 2 por coherencia importe/cantidad/stock; mismo prorrateo que C4, sin efectos |
| D30 estado de sesiones en selector | Mejora opcional; no implementada |
| D02,D04,D08,D09,D13,D14,D15,D16,D19 | Ausentes del registro vigente; sin trabajo atribuible |

## Pendientes y criterio de cierre

No quedan bloqueos conocidos de los recorridos backend autorizados de fase 2. C1/C5, administración comercial y D29 son utilizables por Claude desde los servicios, validadores y SDK indicados, con fixtures y pruebas reproducibles. C0 informa `phase:2`, `trackedStockSales:true`, `retailUiReady:false`; la comprobación individual sigue bloqueando artículos sin stock asignado o con moneda/disponibilidad inválida.

Para declarar apta esta fase se exige: migración compatible, suma de ubicaciones conciliada, venta simple/variante real, navegación completa de 501 artículos, políticas independientes de web, última unidad concurrente sin sobreventa, reintentos sin duplicación, devolución referenciada, rollback integral y permisos/aislamiento probados. Todos esos criterios pasan localmente. Un fallo en cualquiera de ellos impediría el cierre técnico.

Quedan fuera de esta declaración: integración React de Claude, validación visual/táctil, conciliación verificable de datos particulares de una instalación, C6, C7 completo, publicación y las 67 incidencias globales de privacidad. No se despliega ni se declara apta la publicación mientras ese gate global siga fallando. No se avanzó a fase 3.
