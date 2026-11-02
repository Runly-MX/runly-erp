# Runly Commerce Recovery — cierre técnico de fase 5

Fecha: 2026-11-01. Base: `6f8d7c485` en `main`.

Commit de implementación: `8f19e39d6` (`fix(pos): consolidate phase 5 settings, table management and mobile access`). Este informe se registra en un commit documental posterior.

## Alcance y custodia del repositorio

Se revisaron el plan maestro, el plan de ejecución, la especificación UX y los informes de frontend de fase 5 e integración de Tienda y Restaurante. El árbol estaba limpio antes de editar; `33a7c2428` y `1fd80f5d1` son ancestros de la base. Se trabajó directamente en `main`, sin ramas, worktrees, SSH, push ni despliegues. No se detectaron cambios concurrentes ajenos durante el trabajo.

Todas las comprobaciones de escritura usaron PostgreSQL y servicios de autenticación/almacenamiento locales desechables, migrados desde cero y con datos sintéticos. No se utilizaron bases reales o compartidas, endpoints simulados ni nuevas migraciones. Se conserva el modelo de datos histórico.

## Cambios implementados

### Configuración POS

- `usePosSettings` distingue la respuesta envuelta, una fila histórica directa y una fila explícitamente ausente (`data: null`). Conserva `false` y cero.
- Las consultas administrativas incluyen empresa y sesión en su clave y requieren ambas. El formulario se reinicia al cambiar de empresa u operador.
- General envía exclusivamente modalidad o propinas editadas; Avanzado envía exclusivamente el impuesto editado. Ningún guardado reescribe campos ocultos con valores por defecto.
- Una carga fallida muestra error y reintento. No ofrece un formulario de valores inventados para guardar.
- Un impuesto vacío, inválido o fuera de 0–100 bloquea el guardado. Un cero introducido expresamente sigue siendo válido.
- La respuesta confirmada actualiza la caché antes de descartar los borradores. Crear/editar sucursales invalida también navegación y contexto operativo.
- Se añadieron tres regresiones unitarias de selección de respuesta, actualizaciones parciales y validación del impuesto.

Antes de corregir, un recorrido de navegador reprodujo dos defectos: borrar el impuesto guardaba cero sobre 16, y una lectura fallida dejaba habilitado el guardado de valores por defecto. Esas dos comprobaciones dieron 0/2 en la base. Las comprobaciones posteriores verifican peticiones reales y las filas resultantes en PostgreSQL.

### Administración táctil

Se ampliaron las superficies de interacción de Administración en teléfono sin cambiar sus cuatro pestañas ni su estructura. Los botones de edición tienen nombres accesibles. `SwitchField` incorpora una superficie opcional de 44 px conservando la pista visual; sus consumidores anteriores mantienen el tamaño predeterminado. `Combobox` admite una clase opcional para aplicar el mismo mínimo al contenido portallado.

Medición en Chromium a 390 × 844 CSS px, temas claro y oscuro: **36 recorridos y 234 mediciones de controles, mínimo 44 × 44 px, cero incumplimientos**. Incluye pestañas, General, Cajas, Restaurante, Avanzado, formularios de creación/edición de sucursal, terminal, método y estación, modificadores y opciones desplegables. No hace falta un rediseño adicional de Claude para este alcance.

### Mesas sin plano

El contrato C6 existente permite editar nombre, capacidad y disponibilidad con `expectedVersion` e idempotencia. Se añadió un formulario mínimo desde Mesas para quienes ya tienen la capacidad administrativa correspondiente; no se amplió el permiso de los meseros.

Deshabilitar exige confirmación, conserva la fila y su historial, y permite recuperar la mesa desde «Mesas deshabilitadas». Una mesa ocupada o que requiere conciliación bloquea el cambio de disponibilidad. Un conflicto de versión exige cerrar y reabrir el formulario con los datos actuales; una respuesta perdida reutiliza el mecanismo de reintento de `usePosCommand`. No falta ningún contrato de servidor para esta operación.

### Hoja móvil y permisos

La hoja abierta aplica `inert` a todas las ramas exteriores hasta `body`, incluido encabezado y barra lateral. Se conserva el foco inicial, el ciclo Tab/Shift+Tab y el retorno al asa al cerrar. Las ramas que ya eran `inert` no se alteran al limpiar el efecto.

Se verificaron navegación por modalidad, accesos de mesero/cajero/administrador y aislamiento de empresa/sucursal/terminal mediante los recorridos y contratos existentes. Las pantallas nuevas consumen C0; ocultar una entrada de navegación sigue siendo complementario a los controles del servidor.

## Retirada de código heredado

Se analizaron imports, exports, imports dinámicos y `require` mediante AST en **4,625 archivos JavaScript versionados, sin fallbacks de parseo**. El conjunto retirado no tenía consumidores fuera del propio conjunto. La búsqueda posterior de referencias quedó vacía y el build resolvió las rutas vigentes.

Archivos retirados, relativos a `apps/desktop/src/modules/runly.pos/`:

- `screens/PosTablesScreen.jsx`, `screens/ComandaScreen.jsx`, `screens/PosTerminalScreen.jsx`.
- `components/ComandaLineList.jsx`, `ModifierSheet.jsx`, `SplitBillDialog.jsx`, `OrderPanel.jsx`, `TableMap.jsx`, `PaymentDialog.jsx`, `ProductGrid.jsx`, `SeatChips.jsx`, `LineEditSheet.jsx`.
- `hooks/usePosOrder.js`.

Se conservaron deliberadamente:

- `retail/LegacyTerminalEntry.jsx`: consumidor vigente de `/pos/terminal`, con control de acceso y redirección al flujo actual.
- `PosStationsScreen`, `KitchenStationBoard` y `usePosKitchen`: siguen conectados a una ruta real. Los contratos comprueban que las mutaciones agregadas antiguas no eluden los controles actuales.
- Los diálogos de apertura/cierre de sesión, Floor Planner y sus adaptadores, hooks administrativos, SDK y rutas de compatibilidad todavía utilizados.
- Órdenes, pagos, cortes, productos, permisos e identidades históricas. No se borraron tablas ni registros.

## Contratos disponibles para Claude

No cambia la forma pública de los contratos C0–C8. C0 continúa siendo la autoridad de contexto y capacidades; C1/C2 mantienen precios y órdenes del servidor; C3/C4 conservan cobros, preview y devoluciones auditadas; C5 mantiene existencias e historia; C6 ya cubre mesas simples; C7/C8 conservan recibos, sesiones y cortes.

Los nuevos puntos reutilizables son `selectPosSettings`/`settingsPatch`, `POS_ADMIN_TOUCH`, `SwitchField.touchTarget` y `Combobox.contentClassName`. La edición sencilla de mesas consume el comando C6 publicado, sin endpoints nuevos. La impresión y la operación de hardware se validarán en fase 6.

## Verificación

| Prueba ejecutada | Resultado |
|---|---|
| Regresiones unitarias de escritorio POS/Catálogo, SDK, tema y UI | 306/306, 21 suites, sin omitidas |
| `scripts/test-commerce-postgres.mjs` | 195/195, 31 suites, sin omitidas |
| `.e2e/commerce-restaurant-ui.mjs` — Restaurante y Cocina | 143/143 |
| `.e2e/commerce-restaurant-integration.mjs` | 41/41 |
| `.e2e/pos-retail-ui.mjs` | 83/83 |
| `.e2e/commerce-gallery-phase3.mjs` | 17/17 |
| Catálogo básico, copia local del recorrido con espera de activación del arrastre | 86/86 |
| `.e2e/catalog-integration-validation.mjs` — Catálogo ampliado | 90/90 |
| `.e2e/commerce-phase5-technical.mjs` — fase 5 y regresiones técnicas | 134/134: 83 comprobaciones existentes y 51 adicionales |
| ESLint de `apps/desktop/src` y `packages/ui/src` | Correcto |
| Build Vite de los stacks E2E, con el árbol de trabajo real | Correcto |
| Catálogo RBAC | 349 permisos de manifiestos y 349 de catálogo; cero faltantes o sobrantes |
| Política UUID | Correcta |
| React Doctor | Sin errores; 75/100, tres advertencias de mantenibilidad |
| `pnpm check:privacy` | 67 hallazgos; la base también tiene 67. Cero hallazgos en los 15 archivos añadidos/modificados, incluido este informe |

Los recorridos E2E utilizan el stack desechable de `.e2e/lib/purchases-stack.mjs`; la API de trabajo, autenticación y PostgreSQL son reales. Las simulaciones de pérdida de respuesta ejecutan primero la petición real y después descartan su respuesta. El caso de fallo de lectura aborta la petición real, sin sustituirla por datos inventados.

La variante básica antigua de Catálogo se detuvo dos veces en 11/12 por enviar toda la secuencia de teclado del arrastre sin esperar su activación. La copia que utiliza las mismas pausas de 250 ms del recorrido de Galería pasó 86/86, incluyendo la comprobación del orden persistido. El recorrido ampliado de integración ya incorpora esas pausas. Los localizadores, la espera de animación y la espera de confirmación del servidor del verificador técnico se ajustaron antes de la corrida final; no se modificó el producto para satisfacer esos errores del harness.

Los registros, capturas y utilidades de ejecución locales permanecen fuera del control de versiones. La regresión unitaria de configuración queda versionada en `lib/__tests__/pos-settings.test.js`.

### Casos de aceptación comprobados

- General carga HYBRID, impuesto 16 y propinas desactivadas desde la fila real. Guardar únicamente propinas conserva modalidad, tasa y política fiscal, y envía únicamente `tipsEnabled`.
- Avanzado no envía una tasa vacía; introducir cero expresamente persiste cero sin alterar modalidad ni propinas. Cambiar de empresa descarta el borrador anterior; una lectura fallida no permite guardar valores por defecto.
- Mesas permite renombrar conservando ID y `floor_id` nulo, deshabilitar con confirmación sin borrar, volver a habilitar y bloquear la deshabilitación de una mesa ocupada. El servidor rechaza la edición de metadatos por un mesero.
- Restaurante devuelve una de dos piezas de $50 mediante el preview autoritativo. Un mesero sin permiso de devolución recibe 403 al solicitar el preview. Tras respuesta perdida, el reintento registra exactamente un reembolso de $50. La caja de otra sucursal bloquea la interfaz y recibe 404 del servidor; no aparece un segundo registro.
- La comanda móvil recibe el foco; 14 Tab y seis Shift+Tab no escapan. Encabezado, barra lateral y controles exteriores quedan `inert`; cerrar devuelve el foco al asa. El botón Cobrar permanece visible en el carrito colapsado y abre el diálogo real.
- PostgreSQL vuelve a comprobar deuda $100, recibido $200, aplicado $100 y cambio $100; pagos/reembolsos concurrentes, reintentos, cancelación con anticipos, reversos, existencias, referencias cruzadas y rutas financieras heredadas. Solo se confirma una venta de la última unidad entre Tienda y Restaurante.

## Pendientes y límite de fase

- Fase 6: lector de pantalla real, tableta/teléfono físico, impresora y terminal bancaria. No son condiciones de cierre técnico de fase 5.
- Fuera de este cambio: los 67 hallazgos de privacidad heredados y las tres advertencias de React Doctor (complejidad de General/SwitchField y un export no componente de Combobox). No se amplió el encargo para refactorizar pantallas aprobadas o limpiar el repositorio entero.
- El código heredado que conserva consumidores se mantiene por compatibilidad; su existencia no autoriza a retirar esas rutas o datos en esta fase.

## Veredicto

**APTO para iniciar fase 6.** La consolidación técnica de fase 5 quedó implementada y verificada. La corrida final de 134 comprobaciones terminó con código de salida cero, sin errores de página ni respuestas 5xx, y cerró su stack desechable. Contraste y desbordamiento se comprobaron en 390, 768, 1024 y 1440 px, claro y oscuro.

No quedan bloqueos técnicos de fase 5 detectados en este alcance. Los pendientes físicos y de lector de pantalla pertenecen a la fase siguiente. **Fase 6 no iniciada.**
