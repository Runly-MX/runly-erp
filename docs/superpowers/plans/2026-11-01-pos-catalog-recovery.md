# POS + Catálogo — plan maestro ejecutable

Fecha: 2026-11-01. Base auditada: `46d6d6be7`, `main`.
Estado: etapa 0 entregada documentalmente; etapas 1–6 no ejecutadas.
Fuente normativa: [auditoría y contratos C0–C8](../specs/2026-11-01-pos-catalog-recovery-master.md).

## 1. Forma de ejecución

Trabajar localmente en `main`, sin ramas/worktrees, preservando cambios ajenos. Cada bloque tiene un commit coherente. No push, SSH, despliegues, publicación ni uso de producción. No borrar datos ni reescribir migraciones. No correr sync, migrate, seed o reset en esta entrega. Una etapa incompleta no se declara cerrada por tener pantallas o pruebas de mocks verdes.

Codex: arquitectura, persistencia, integridad, permisos, API, SDK de transporte y pruebas. Claude: arquitectura visual, interacción táctil y React al recibir contratos implementados. Los cambios mínimos en hooks/SDK necesarios para idempotencia no autorizan un rediseño provisional. Ninguna etapa requiere enviar mensajes a terceros.

Secuencia: 0 → 1 → 2 → 3 → 4 → 5 → 6. Puede prepararse el trabajo visual de Claude con fixtures después del contrato técnico, pero no activar pantallas sobre endpoints supuestos. No abrir ciclos de rediseño sin fallos de aceptación documentados. Catálogo y POS siguen siendo módulos oficiales; Tienda/Restaurante son experiencias, no módulos transaccionales nuevos.

## 2. Etapa 0 — auditoría y contratos

**Archivos:** estos dos documentos; fuentes exactas en inventario de la especificación. **Datos:** ninguno. **Dependencias:** repositorio actual y documentos históricos, sin entorno remoto.

**Codex, realizado:** descubrir con grafo y contrastar archivos actuales; revisar manifiestos/permisos, rutas, servicios, esquema core/migraciones, frontend y SDK; clasificar H01–H28; fijar C0–C8, compatibilidad, gates y pruebas; ejecutar suites viables. Se preservaron cambios preexistentes en `apps/api/package.json` y `apps/api/scripts/dev-watch.mjs`.

**Contrato para Claude:** convenciones, DTO, errores, recorridos y permisos de C0–C8; todos marcados objetivo, todavía sin implementación. No cambiar pantallas en esta ejecución.

**Aceptación:** todos los candidatos originales tienen evidencia/estado y trazabilidad; cada etapa declara archivos, datos, dependencia, responsable, riesgo, reversión y cierre; resultados ejecutados separados de pruebas propuestas.

**Riesgos/reversión:** índice parcialmente desactualizado y specs históricas contradictorias; fuentes actuales prevalecen. Revertir sólo los documentos de este trabajo si se encuentra error de auditoría, sin tocar cambios ajenos.

**Evidencia:** HEAD auditado, 88 pruebas API/manifest y 7 adaptadores aprobados, gate global de privacidad fallido preexistente; registro final en §11. No hay certificación operativa ni DB.

## 3. Etapa 1 — integridad operativa

**Objetivo:** ningún camino de escritura puede cobrar, cancelar, cambiar importes o cerrar un contenedor sin controles comunes. No activar nueva venta comercial antes de completar stock de etapa 2.

**Archivos existentes afectados:**

- `apps/api/src/routes/pos/pos-order-service.js`, `pos-session-service.js`, `pos-waiter-shift-service.js`, `pos-scope-service.js`, `service-helpers.js`, `validators.js`, `pos-routes.js` y sus tests.
- `apps/api/src/manifests/official/core-modules.js`, `apps/api/src/permission-catalog.js`, pruebas de manifiesto y permisos.
- `packages/sdk/src/index.js`, hooks `apps/desktop/src/modules/runly.pos/hooks/usePosOrder.js` y `usePosSession.js`; transporte idempotente mínimo en consumidores de comandos, sin rediseño de componentes.
- `prisma/schema.prisma` sólo para modelos core ya existentes y nuevas entidades core; nuevas carpetas de migración. No trasladar tablas RME3 custom a Prisma.

**Archivos nuevos previstos (no creados):** `apps/api/src/routes/pos/pos-command-service.js`, `pos-payment-service.js`, `pos-refund-service.js`, `pos-v2-routes.js`, `pos-contracts.js`; factorizar por responsabilidad, conservando factories. Agregar suites `pos-command-idempotency.test.js`, `pos-financial-contract.test.js` y pruebas PostgreSQL opt-in en `apps/api/src/routes/pos/__tests__/`.

**Cambios de datos:** version/moneda/experiencia/snapshot fiscal, tendered/change, tabla de claves/respuestas de comandos, devoluciones y asignaciones de pagos, índices parciales OPEN y auditoría atómica. Todas las columnas históricas nuevas nullable donde no hay evidencia. Preflight de sesiones/turnos abiertos duplicados, pagos sin contenedor, monedas desconocidas y referencias inconsistentes. No cerrar ni fusionar registros automáticamente. Enlazar refunds/stock/recibos con IDs DB y checks positivos.

**Dependencias:** C0,C2,C3,C4,C8 aprobados documentalmente; disponibilidad y stock definitivos C1/C5 se implementan en etapa 2. Etapa 1 puede cerrar código financiero bajo feature gate y tests de servicio stock inyectado; no puede habilitar ventas de stock controlado. Devolución de legado sin stock documentado nunca repone inventario.

**Secuencia Codex:**

1. Crear pruebas de regresión T01/T02/T03/T07/T12/T16/T17/T20/T21/T22 antes del cambio; reproducir fallos sin datos reales.
2. Introducir contexto operativo C0 y matriz OR de permisos en endpoints nuevos y equivalentes legado. No conceder administración al cajero.
3. Implementar money/quantity contracts con Decimal y errores estables; validar producto habilitado, variante obligatoria y moneda antes de escribir. Para productos sin política comercial final, gate explícito, nunca aceptar unitPrice cliente.
4. Agregar idempotencia duradera y bloqueo compartido contenedor→orden; versionar todas las mutaciones y recalcular dentro de la transacción. Auditoría transaccional; eventos post-commit.
5. Implementar pago con efectivo aplicado/recibido/cambio; bloquear cancelación si hay dinero neto; implementar devolución, snapshot e invariantes de refund. No simular un reembolso bancario real.
6. Hacer apertura, cierre, movimientos y recepción de turnos atómicos; índices únicos sólo tras preflight limpio. Resolver cierre frente a pago y entrega frente a pago usando el mismo bloqueo.
7. Agregar recibo comercial inmutable al finalizar y contrato para impresión, sin afirmar entrega física. Integrar stock por interfaz `tx` que etapa 2 completará; sin commit parcial si stock falla.
8. Adaptar SDK/consumidores legado para clave estable y replay; sin clave, 428 antes de escribir. Entregar fixtures C0,C2,C3,C4,C8 y pruebas de permisos. Marcar C5/C7 restantes como no disponibles.

**Claude consume:** contexto, importes/saldos/versión de orden, errores, pagos y devoluciones. No calcula montos definitivos, ni asume impresión, ni agrega endpoints para cubrir faltantes. Puede diseñar interacción con fixtures sin reemplazar aún recorridos productivos.

**Aceptación:** 100 debidos/200 recibidos → pago 100/cambio 100; reintento mismo pago parcial produce un registro; claves distintas concurrentes no superan saldo; fallo audit/stock revierte pago; precio forjado rechazado; línea y pago se serializan; parcial pagado no cancela; refund parcial/total y anticipo trazables; cierre/turno no reciben dinero después de congelar corte; permisos mínimos funcionan y empresa ajena falla.

**Riesgos:** compatibilidad de clientes sin claves, moneda histórica desconocida, registros OPEN duplicados y locks/deadlocks. **Reversión:** mantener expansión de esquema, deshabilitar comandos nuevos y mutaciones legado incompatibles; lectura histórica disponible. Nunca bajar a escritor que desconozca devoluciones/stock. Reintentar deadlock con misma clave, sin cambios de importes. **Cierre:** diff de migraciones nuevas, preflight con conteos anonimizados, contratos/fixtures/SDK y T01–T04/T07/T12/T16–T18/T20–T22 verdes, con dos conexiones PostgreSQL desechables para carreras; gate de activación todavía cerrado hasta etapa 2.

## 4. Etapa 2 — recuperación de Catálogo

**Objetivo:** identidad comercial, búsqueda completa, variantes, fiscalidad, publicación independiente y stock por sucursal en un solo libro.

**Archivos:** `apps/api/src/routes/catalog/catalog-product-service.js`, `catalog-variant-service.js`, `catalog-stock-service.js`, `catalog-public-service.js`, `products-routes.js`, `variants-routes.js`, `stock-routes.js`, `validators.js`, `index.js`; `pos-kitchen-service.js` (baseline de config), `pos-v2-routes.js`, `packages/sdk/src/index.js`. Nuevos `catalog-sellables-service.js`, `catalog-availability-service.js`, pruebas `catalog-sellables-contract.test.js` y `catalog-stock-ledger.test.js` en el mismo árbol. Pruebas públicas/tenant/export actuales se conservan. React administrativo lo desarrolla Claude en su bloque correspondiente.

**Datos:** política POS por producto+sucursal, tasa/inclusión y versión de precio en producto; movimientos con origen/reversa; saldos comerciales desagregados por sucursal+bucket legado; índices únicos tratando NULL explícitamente. No duplicar ni convertir bienes `runly.inventory`. Preservar slug, SKU/barcode actuales (no imponer unicidad que destruya códigos duplicados), opciones y variantes. Stock entero v1; no añadir receta/unidad fraccionaria sin otra especificación.

**Dependencias:** unidad transaccional, refunds e idempotencia de etapa 1. Consumidor de stock debe recibir `tx`; registrar movimiento y pago en el mismo commit. No reconstruir movimientos de ventas antiguas ni asignar saldo a primera sucursal.

**Codex:**

1. T05–T09/T11/T12/T19/T24/T25: probar filtros, búsqueda SKU/barcode/variantes, scan ambiguo, paginación y disabled; arreglar validación del padre en opciones/variantes y scopes de imágenes.
2. Implementar C1 con DTO único y catálogo comercial que no depende de published. Adaptar snake_case sólo en frontera. Precio VARIABLE informativo, selección obligatoria.
3. Implementar políticas de canal/sucursal y fiscalidad mínima heredable; estado legacy de availableInPos conserva su efecto. No migrar unpublished a no vendible.
4. Migración de saldos a LEGACY_UNALLOCATED idempotente; comprobar total anterior=agregado=suma de ubicaciones; habilitar asignación explícita conservando total. Casos negativos históricos requieren conciliación, no clamp a cero.
5. Centralizar todos los cambios de stock, incluso creación inicial y ajustes admin; eliminar escritura directa en PATCH general. Salida de PAID única por línea, reversa referenciada en refund y protección de saldo bajo bloqueo.
6. Completar C5 con pago/refund reales, pruebas de rollback e insuficiencia; actualizar SDK y entregar fixtures de 501 artículos, códigos duplicados y productos multimoneda.
7. Habilitar comandos sólo en empresas/sucursales con política, moneda y asignación verificadas. Mantener bloqueo específico para artículos aún sin inventario asignado.

**Claude consume:** C1/C5 y administración comercial aditiva; `published` se presenta separado de venta POS; cantidad, impuestos, moneda y disponibilidad vienen del servidor. Se conserva gestor de imágenes y archivos compartidos.

**Aceptación:** producto no publicado vendible si habilitado POS; publicado pero no disponible en sucursal no se cobra; variable requiere variante correcta; 501.º artículo accesible; escaneo conserva ceros y devuelve ambigüedad explícita; dos ventas de la última pieza sólo completan una; retry/reversa no duplican stock; devolución sin salida histórica no fabrica saldo; migración repetida no duplica cantidad.

**Riesgos:** stock global ambiguo, ajustes paralelos de lectores/escritores anteriores, currencies inconsistentes, códigos repetidos. **Reversión:** deshabilitar escritura/activación, conservar tablas expandidas y ledger; no copiar suma por sucursal encima de un saldo viejo independiente. **Cierre:** conciliación de fixtures y migración dos veces, pruebas SQL concurrentes, regresión pública/tenant/export y C0–C5/C8 implementados con evidencia. Éste es el gate mínimo para Tienda.

## 5. Etapa 3 — POS Tienda

**Objetivo:** apertura → búsqueda/escaneo → selección de variante → cantidades/descuento autorizado → cobro/cambio → comprobante → siguiente venta → devolución/cierre, sin mesa, comensal ni cocina obligatorios.

**Archivos:** Claude en `apps/desktop/src/modules/runly.pos/screens/PosTerminalScreen.jsx`, `CajaScreen.jsx`, `PosHomeRedirect.jsx`; componentes `ProductGrid.jsx`, `OrderPanel.jsx`, `PaymentDialog.jsx`, `LineEditSheet.jsx`, `SessionOpenDialog.jsx`, `SessionCloseDialog.jsx`, `hooks/usePosCatalog.js`, `usePosOrder.js`, `usePosSession.js`, `usePosSettings.js`. Extraer experiencia Tienda dentro del mismo módulo; conservar paths públicos con redirecciones internas compatibles. Codex en recibos/print jobs, `packages/sdk/src/index.js`, manifiestos y pruebas de rutas. Registro frontend debe descubrirse en el estado de esa ejecución, sin asumir el viejo `modules/atlas.pos`.

**Datos:** intentos de impresión C7; no nuevas órdenes/cajas/saldos paralelos. Selección por identidad+empresa en almacenamiento local. **Dependencias:** etapas 1/2 y C0–C5/C7/C8 verificados; contrato de capacidades nativas existente. No introducir nuevo bridge Bluetooth.

**Codex:** terminar C7 con generación de payload/errores sin side effects de lectura; persistir job idempotente y reimpresión vinculada. Añadir pruebas T10/T13/T15/T28 y rutas SDK. Resolver gates de sesión/sucursal en createOrder y pagos. Pruebas de integración de cambio de empresa con lista vacía.

**Claude:** implementar recorrido táctil usando componentes compartidos; conservar paginación y estado de error, seleccionar variante antes del carrito; identificar borrador pendiente distinto de orden confirmada. No hacer Promise.all de líneas sin claves ni repetir lote parcialmente guardado al fallar. No mostrar «cobrado» hasta respuesta/replay servidor. No requerir planos. Monto aplicado y recibido son controles distintos según método. Menú de devolución sobre una venta histórica consume C4. Totales autoritativos y moneda siempre visibles.

**Aceptación:** T01/T02/T05–T13/T15/T18/T28; apertura con permisos mínimos, venta completa con 100/200, búsqueda+escaneo, ajuste de cantidad, descuento denegado/autorizado, devolución parcial, caída de red tras commit, impresora ausente/fallida, reimpresión sin doble cobro, cierre correcto y empresa B sin IDs/carrito de A. Comando retail resulta TAKEAWAY, sin seats.

**Riesgos:** carrito local duplicado al reintentar flush, caché empresarial, hardware no disponible. **Reversión:** gate por experiencia; retirar acceso de nueva pantalla conservando lectura/recibos y contratos seguros; no reactivar formulario viejo que envía recibido como amount. **Cierre:** evidencia navegador/tablet de casos secuenciales y recuperación, pruebas contrato y transporte, reporte de hardware con distinción SUBMITTED/CONFIRMED; sin papel probado, esa capacidad queda explícitamente sin certificar.

## 6. Etapa 4 — POS Restaurante

**Objetivo:** mesas simples sin planner, Comandero con sucursal explícita, modificadores/notas, envíos incrementales, KDS, cuenta dividida atribuida y cobro/cierre compartidos.

**Archivos backend:** `pos-floor-service.js`, `pos-floor-routes.js`, `pos-kitchen-service.js`, `pos-modifier-service.js`, `pos-reservation-service.js`, servicios de orden/pago v2 y contratos. Frontend de Claude: `screens/PosTablesScreen.jsx`, `ComanderoScreen.jsx`, `ComandaScreen.jsx`, `CocinaScreen.jsx`, componentes `SplitBillDialog.jsx`, `KitchenStationBoard.jsx`, `ModifierSheet.jsx`, `SeatChips.jsx`, hooks de cocina/mesas/modificadores. Conservar `lib/floorObjects.js`, `plannerObjects.js` y renderer Canvas; ajustar sólo adaptación que requiera mesa sin plano.

**Datos:** outletId explícito en mesas, floorId nullable; dispatch/version y unicidad de envío por línea; atribuciones de pagos ya previstas en etapa 1. Rellenar outlet desde floor de cada mesa existente; ninguna reasignación por primer outlet. **Dependencias:** C0–C5/C7/C8 y motor financiero estable, contratos C6 implementados antes de conectar UI.

**Codex:** implementar C6; T14/T15/T23/T26/T27. Validar estación/outlet/producto y fallback, ticket e incrementos enviados; proteger estado terminal financiero frente a KDS. Atomicidad línea/ticket y eventos post-commit; polling/realtime de recuperación por ID. Pagos por líneas/asientos con saldo atribuible, no varios botones del mismo total sin asignación. Reservas y mesas existentes no pierden relaciones.

**Claude:** lista de mesas sencilla y plano opcional avanzado; selector explícito de sucursal validado; DINE_IN con mesa/comensales y mostrador restaurante sin mesa. Notas/modificadores aparecen en pedido y KDS. Cambios después de enviar son extras/nueva línea o anulación autorizada según C6; no editar silenciosamente cocina ya enviada. Dividir muestra saldo de cada cuenta y pagos generales. Cobro en mesa requiere allowTableCharge y turno propio; caja cobra contra su sesión compartida.

**Aceptación:** negocio sin Floor Planner crea mesa y opera; envío repetido produce mismo ticket; agregar un extra no reimprime consumo anterior; estación de otra sucursal se rechaza; sin KDS configurado hay operación manual explícita; secuencia cocina válida sin reabrir venta pagada; dos meseros no cobran mismo asiento; corte de mesero recibido una vez y aparece una vez en caja.

**Riesgos:** tickets históricos sin dispatch, kitchen state arbitrario heredado, modificaciones parciales y mesas en múltiples órdenes. **Reversión:** desactivar nuevas escrituras de restaurante; mantener lectura histórica y operaciones financieras seguras. No borrar pisos/mesas ni migrarlos a Boards. **Cierre:** T14/T15/T22/T23/T26/T27 y regresión reservas/Canvas; smoke real comandero→KDS→caja→corte con dos clientes locales y evidencia de reconexión.

## 7. Etapa 5 — administración y consolidación

**Objetivo:** configurar modos, moneda/fiscalidad/disponibilidad, caja, estaciones y permisos sin duplicación, con lectura histórica/conciliación claras.

**Archivos:** `screens/PosAdminScreen.jsx`, `PosSettingsScreen.jsx`, `PosStationsScreen.jsx`, `PosSessionsScreen.jsx`, `PosOrdersScreen.jsx`; `apps/desktop/src/modules/runly.catalog/screens/` y `components/VariantMatrix.jsx`, `StockMovementModal.jsx`; manifiestos, permission-catalog, lifecycle ownership y pruebas. `docs/developers/` sólo si se documenta un contrato público de módulo: es la única fuente editable de esas guías, regenerar copias por la cadena establecida; no tocar copias a mano.

**Datos:** ninguna migración destructiva; sólo completar constraints ya verificadas y metadata de ownership para nuevas entidades. Revisar ownership POS para turnos/modificadores/refunds/print jobs: inventario actual de lifecycle no enumera todos esos modelos aunque supportsDataPurge=false; no habilitar purge para resolverlo. Mode global sigue legible para compatibilidad, configuración efectiva por outlet.

**Dependencias:** etapas 1–4 cerradas y permisos acordados; Claude conserva diseño y UI. **Codex:** reconciliación de órdenes/pagos/refunds/cortes/stock/recibos, queries de auditoría por empresa, exportes existentes compatibles, prohibir hard delete de documentos financieros, validar configuración y completar tests de roles/alias. **Claude:** formularios y tablas con @runly/ui, PageHeader/ErrorState/EmptyState/ConfirmDialog; navegación Tienda/Restaurante según modo, estados de moneda desconocida y stock sin asignar accionables; conservar archivos inline y flujo de publicación web separado.

**Aceptación:** T19/T24/T25/T28/T29; operador no puede administrar ni ver datos ajenos; administrador puede preparar sucursal nueva sin planner y sin publicar en web; precios cambiados no alteran ventas; sumas de exportes cuadran con ledger; alias `atlas.*` siguen resolviéndose y módulos oficiales no se duplican.

**Riesgos/reversión:** permisos demasiado amplios y eliminación apresurada de legado. Mantener endpoints de lectura/alias, revertir cambios de navegación independientemente de schema. No retirar escritores viejos hasta demostrar que todos usan comandos seguros; no conservar una vía alternativa insegura por compatibilidad. **Cierre:** catálogo/manifiestos/ownership, matriz de roles, regresión de exportes e integración, documentación de contratos disponibles y ninguna pantalla exige CRUD Catálogo para vender.

## 8. Etapa 6 — validación y cierre

**Archivos:** suites API/SDK/frontend, fixtures anonimizados y registro de resultados en este plan; no copiar logs/URLs/identidades de instalaciones. **Datos:** sólo fixtures en base local desechable validada explícitamente; migraciones de expansión y backfill se prueban desde snapshot sintético legado y base vacía, nunca reset de datos existentes.

**Dependencias:** todas las etapas y contratos, dispositivo/impresora para certificar transporte concreto. **Codex:** ejecutar T01–T29 y suites existentes, comprobar SQL concurrente y rollback, migraciones repetibles, privacy/RBAC/UUID/checksums apropiados al diff; comparar totales y ausencia de duplicados. **Claude:** evidencia táctil de los recorridos pactados en tablet/móvil/escritorio, foco/teclado/lector y recuperación de errores, sin inventar nuevos recorridos de rediseño.

**Aceptación:** todos los críticos cerrados con prueba, ninguna operación cruza empresa/sucursal, pagos/stock/reversas se concilian, impresión distingue intento de hardware, históricos conservados, experiencia Tienda y Restaurante funcionan sin duplicar dinero. Pruebas DB y hardware omitidas impiden afirmar cierre completo; se puede cerrar sólo capacidad explícitamente verificada.

**Riesgos/reversión:** falsos verdes por mocks o capturas estáticas. Mantener gates deshabilitados y volver al último conjunto seguro de comandos sin borrar los nuevos documentos. **Evidencia de cierre:** commit/diff, comandos y exits, fixtures y reporte de conciliación, matriz H→C→T actualizada, capturas locales anonimizadas y comprobantes de hardware si aplican. Publicación/despliegue requieren otra solicitud; no se deducen de aprobar pruebas.

## 9. Matriz de aceptación automatizada y operativa

Estas pruebas son **trabajo futuro**, salvo las suites existentes de §11. Los nombres T no representan archivos ya creados. Unitarias cubren reglas; rutas cubren auth/DTO; DB usa dos conexiones independientes y barreras, no promesas contra un mock.

| Prueba | Hallazgos / contrato / etapa | Caso y evidencia requerida |
|---|---|---|
| T01 Rol operativo | H01,H28 / C0 / 1,3,5 | HTTP con cajero, mesero, cocina, admin; lectura operativa 200 sin settings.manage; mutación no autorizada 403. Catálogo vendible legible sin CRUD. |
| T02 Efectivo | H02 / C3,C8 / 1,3 | 100/200 produce captura100+cambio100 y caja+100; CASH parcial, tarjeta sin cambio y referencia requerida; payload forjado y NaN rechazados. |
| T03 Cancelación | H03 / C4 / 1 | OPEN pagado parcial →409 sin modificación; devolver anticipo y cancelar con motivo; carrera cancel/pago sólo una transición válida. |
| T04 Refunds | H04 / C4,C5 / 1,3 | Parcial/total/múltiples pagos, stock con/sin reposición, anticipo, céntimos en último tramo, sesión original cerrada y salida en actual, retry sin duplicar. |
| T05 Categorías | H05 / C1 / 2,3 | Prueba SDK→ruta→query con categoryId; resultados y total de categoría coinciden, vacía explícita; compatibilidad de filtro legado decidida en adaptador. |
| T06 Búsqueda/scan | H06 / C1 / 2,3 | SKU, barcode de variante, nombre parcial, código con ceros, ambiguos, inexistente y no autorizado; no autoagregar ambiguo. |
| T07 Variantes | H07 / C1,C2 / 1–3 | Padre variable rechazado sin selección; variante ajena, disabled o de otro producto rechazada; precio/tax/currency y stock correctos. |
| T08 Paginación | H08 / C1 / 2,3 | 501 productos, categorías/búsqueda combinadas, siguiente página y total estables; producto final accesible sin elevar límite arbitrariamente. |
| T09 Disponibilidad | H09 / C1,C2 / 1,2 | Bloqueado en outlet A, habilitado en B; unpublished vendible POS, disabled nunca vendible por ID; herencia baseline y variante. |
| T10 Retail | H10 / C2 / 3 | Venta rápida crea TAKEAWAY+RETAIL sin mesa/seats; HYBRID exige experiencia; RESTAURANT mantiene DINE_IN. |
| T11 Venta/stock | H11 / C3,C5 / 1,2 | Una transición PAID produce una salida por línea; dos compradores última pieza, sólo uno paga; rollback stock/pago; no descontar otra vez al reintentar. |
| T12 Monedas | H12 / C1,C2 / 1,2 | USD frente a MXN se rechaza antes de insertar línea/pago; orden y recibo congelan moneda; histórico desconocido consultable pero no monetizable. |
| T13 Cambio empresa | H13 / C0 / 1,3 | A→B con listas llenas y vacías, usuario distinto, ID guardado inválido/pareja distinta, carrito y request en vuelo; sin IDs/datos cruzados. |
| T14 Sucursal mesero | H14 / C0,C6 / 4 | Varias sucursales, orden de lista invertido; ninguna seleccionada implícitamente; mesa y comanda usan selección autorizada. |
| T15 Ticket/impresión | H15 / C6,C7 / 3,4 | Lectura no incrementa; mismo job ante retry; fallo/cancelación no afirma impreso, reimpresión misma venta; KDS recibe después de reconectar; papel requiere dispositivo. |
| T16 Pagos concurrentes/retry | H16,H21 / C3 / 1 | Dos conexiones, saldo100 y pagos80+80; suma<=100. Pago20 repetido con misma clave y timeout tras commit produce20 una vez. Clave reutilizada con otro body409. |
| T17 Scope | H17 / C0,C3 / 1 | Orden/mesa/sesión/terminal/turno/estación de empresa u outlet ajeno rechazados, sin cambios; conservar casos existentes de creación correctos. |
| T18 Histórico | H18 / C2 / 1,3 | Cambiar Catálogo/precio/impuesto/nombre no cambia líneas/recibo original ni base de refund; borrar/deshabilitar producto no rompe lectura histórica. |
| T19 Web independiente | H19 / C1 / 2,5 | Slug/host empresa, proyección sin columnas internas, publicado/disabled, página pública no revela disponibilidad privada de otra empresa. |
| T20 Precio/fiscalidad | H20 / C2,C3 / 1 | unitPrice cliente prohibido; descuento con/sin permiso; IVA incluido 116→base100/tax16 y excluido100→116; versión evita editar mientras paga. |
| T21 Atomicidad | H21 / C3 / 1 | Fallo inducido audit/stock/receipt revierte toda captura; commit exitoso y fallo de evento no obliga nuevo cobro; respuestas replay y autorización después de timeout. |
| T22 Sesiones/cortes | H22 / C8 / 1,4 | Dos aperturas simultáneas una OPEN; close/pago excluyentes; dos recepciones mismo turno un WAITER_DELIVERY; fallo intermedio sin corte huérfano; cash/card/refund reconciliados. |
| T23 Cocina | H23 / C6 / 4 | Reenvío no duplica; sólo extras, estación misma sucursal, no PAID→SENT, notas/modificadores, saltos KDS rechazados y ticket derivado de líneas. |
| T24 Catálogo aislado | H24 / C1,C5 / 2,5 | Padre opción/variante ajeno, mismatch de path y covers de otra empresa no se insertan/actualizan/firman; tests de servicio y ruta. |
| T25 Libro stock | H25 / C5 / 1,2,5 | PATCH stock general rechazado, ajuste auditado, fraccionario controlado rechazado, duplicado/reversa única, aggregate=sum ubicaciones, transferencia legado sin aumentar total. |
| T26 División | H26 / C3,C6 / 4 | Cuenta A pagada no cobrable otra vez aunque B tenga saldo; reparto céntimos, pagos generales, reatribución y refund; suma asignaciones<=neto por pago/línea. |
| T27 Sin planner | H27 / C6 / 4 | Empresa/sucursal sin floor crea mesas simples y pedido; mesa existente conserva plano/reserva/ID tras migración; Canvas sigue operativo. |
| T28 Recorrido/UI | H28 / C0–C8 / 3–5 | Tablet/móvil/escritorio; PageHeader/estados/confirmaciones/componentes compartidos, sin etiquetas de mesa en Tienda; lector teclado y permisos visibles coherentes. |
| T29 Migración/regresión | Todos / C0–C8 / 5,6 | Base limpia+fixture legado, backfill dos veces, conteos/sumas iguales, desconocidos reportados, alias y módulos preservados, no DDL destructivo ni migraciones históricas cambiadas. |

## 10. Primera fase técnica preparada

El siguiente trabajo autorizado por separado debe empezar en etapa 1, no en una pantalla nueva. Orden recomendado de commits locales: (a) regresiones y DTO C0/C2/C3/C8; (b) migraciones expansivas y preflight; (c) comandos/pagos/cancelaciones/devoluciones y auditoría; (d) sesión/turno y locks; (e) SDK idempotente, fixtures y gate. Todos conservan las pruebas actuales. No fusionar correcciones de Notes/Studio/watch de sesiones ajenas en esos commits.

Antes de ejecutar una prueba DB, comprobar que el destino es desechable y local sin imprimir credenciales. Usar variable exclusiva de pruebas, nunca fallback a DATABASE_URL de la aplicación. No asumir que una instancia en localhost es desechable. Si no se dispone de esa base, avanzar con código/contratos pero dejar carreras/migración y el gate sin cerrar; no pedir aprobación para un cambio indefinido ni afirmar integridad sin evidencia.

## 11. Registro de verificación de esta primera ejecución

Fecha 2026-11-01, Node v22.23.3, pnpm 9.15.0. Comandos desde raíz, sin entorno remoto.

```powershell
$testFiles = @((Get-ChildItem apps/api/src/routes/pos/__tests__ -Filter *.test.js).FullName) + @((Get-ChildItem apps/api/src/routes/catalog/__tests__ -Filter *.test.js).FullName) + @('apps/api/src/manifests/official/__tests__/runly-pos-contract.test.js')
node --test --test-reporter=spec $testFiles
node --test --test-reporter=spec apps/desktop/src/modules/runly.pos/lib/plannerObjects.test.js apps/desktop/src/modules/runly.pos/lib/floorObjects.test.js
pnpm check:privacy
```

- API/manifest: exit 0, 88 tests/20 suites, pass88/fail0/skip0, duración14310ms. POS servicios66 + manifiesto3 + Catálogo19. Catálogo incluye estadísticas5, tenant8, stock-permissions2, export4.
- Adaptadores frontend POS/Canvas: exit 0, 7 tests/2 suites, pass7/fail0/skip0, duración207ms.
- Total95 aprobadas. Ninguna ejecución DB, navegador, impresora o adquirente. Los mocks no prueban rollback SQL ni serialización real. No se ejecutó `user-isolation.integration.test.js`, aunque contiene casos POS: requiere base desechable y modifica/limpia fixtures. No se midió porcentaje de cobertura ni build React: no se modificó React.
- Privacy basal: exit1, 67 hallazgos/6420 archivos, en Notes, automatizaciones, Studio, licencia de fuente y spec previa; valores omitidos. No modificarlos como parte de recuperación. No equivale a 67 secretos confirmados: es el resultado de reglas de política.
- Privacy final global: exit1, 67 hallazgos/6422 archivos; mismos hallazgos basales, ninguno en estos documentos. `inspectFile` exportado por el comprobador, ejecutado directamente sobre ambos Markdown: cero hallazgos. La primera invocación inline falló por comillas de PowerShell antes de ejecutar el análisis; se corrigió usando here-string por stdin y la verificación terminó exit0.
- Revisión de estructura, enlaces relativos y bloques JSON de ejemplo: comprobación local automatizada; IDs H01–H28/C0–C8/T01–T29 cubiertos. `git diff --check` sin errores. Sólo se incluyen los dos documentos en el commit de esta entrega.
- HEAD avanzó a `1c0fda679` por commits concurrentes de shell/calendario y dev-watch. Se verificó el cambio de estado; esta entrega no modificó ni revirtió esos archivos. Base funcional auditada y límites de pruebas se conservan explícitos.

## 12. Qué entrega y qué no cierra esta ejecución

Entregados: auditoría H01–H28, contrato C0–C8 y etapas0–6 con pruebas T01–T29. Código conservado y reemplazo acotado definidos en especificación §4. No se sustituyeron pantallas ni se implementaron las fases. La primera fase técnica está lista para ejecución posterior: integridad operativa.

Pendientes para cierre comercial: implementaciones/contratos disponibles en API, migraciones en DB desechable, pruebas de concurrencia y rollback, recorridos táctiles, impresión verificable, conciliación e higiene global del repositorio. Las 95 pruebas aprobadas dan una línea base útil; no cierran esos pendientes.
