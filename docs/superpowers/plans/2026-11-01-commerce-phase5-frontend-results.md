# Runly Commerce Recovery — fase 5: consolidación UX/UI

Fecha: 2026-11-01. Base: `920074c95`. Solo código local y pilas desechables con PostgreSQL real; sin SSH, push ni despliegue. No se tocaron migraciones, servicios, reglas financieras ni contratos C0–C8. Fase 6 no iniciada.

## Pantallas y componentes modificados

- **Administración** (`PosSettingsScreen.jsx`): de cinco pestañas técnicas a **General** (modalidad de negocio, propinas, sucursales), **Cajas y pagos** (terminales y métodos de pago), **Restaurante** (solo si el negocio o alguna sucursal es Restaurante/Mixta: mesas, comandero y preparación, estaciones, modificadores y plano del salón marcado como opcional) y **Avanzado** (tasa de impuesto predeterminada). Sin ajustes ni endpoints nuevos; «Híbrido» pasa a «Mixto». El indicador de estado usa el `StatusPill` compartido.
- **Navegación** (`RunlyApp.jsx`, `posNavigation.js`, `usePosNavModes.js`): la barra lateral de POS oculta Comandero y Cocina cuando ninguna sucursal es Restaurante o Mixta. Si no se conocen las modalidades (cargando, sin permiso o error) no se oculta nada. Los permisos siguen filtrando como antes.
- **Órdenes** (`RetailOrdersScreen`, `OrderDetailDialog`): ahora listan Tienda y Restaurante, con filtro de tipo; el título es «Órdenes de tienda» solo si todas las sucursales son de tienda. Se muestran cuenta, mesa, mesero y sucursal.
- **Hoja móvil** (`@runly/ui` `PeekSheet`): nuevas props `modal` y `action`. Comanda y carrito de Tienda usan `modal`.
- **Avisos de conexión** (`ConnectionNotice`, `usePendingCount`): en Mesas y en la lista de Caja.
- **Cocina**: sin cambios en lógica.

## Devoluciones de Restaurante

Reutilizan el flujo ya aprobado de Órdenes (`refundPreview` → `refund` con clave persistente) sin duplicarlo. Se levantó la restricción que limitaba devolver y cancelar a Tienda. Cancelar admite también estados de servicio (enviada, en servicio, servida). El importe, el impuesto y el reparto por pago los calcula el servidor (preview); React solo elige partidas y cantidades.

Comprobado en navegador y PostgreSQL: se localiza «Mesa Dev · cuenta #n» con mesero, sucursal, partidas con nota y pagos; el preview de 1 de 2 piezas da $50.00; una respuesta perdida se reintenta con la misma clave y deja **un** reembolso de $50.00 y `refunded_amount` $50.00; el resultado indica qué pasó con existencias. **Bloqueo**: con la caja guardada de otra sucursal, la interfaz deshabilita el cálculo y pide abrir la caja de la sucursal de origen, y el servidor rechaza (404) un reembolso hacia la caja de otra sucursal sin crear un segundo registro.

## Accesibilidad y móvil

- **Hoja de comanda**: abierta, el resto de la página queda `inert`, Tab y Shift+Tab no salen de la hoja (0 escapes en 20 pulsaciones), el foco entra a la hoja, `role="dialog"` y `aria-modal`; Escape cierra y devuelve el foco al asa. Verificado con teclado en 390 px.
- **Cobro en Tienda móvil**: con el carrito colapsado, el botón «Cobrar» (56 px) vive en la propia tira, sin tapar productos. Comandero móvil recibe «Enviar» (o «Reintentar» si hay un envío sin confirmar) con el mismo patrón.
- **Avisos**: Mesas y Caja distinguen sin conexión, información potencialmente desactualizada, recuperando, operación pendiente de confirmar y confirmado por el servidor (con la hora), siempre con icono y texto. Si falla una actualización con datos ya cargados, la lista se conserva en vez de reemplazarse por un error.
- **Cocina**: sin tocar.

## Defecto latente corregido

`usePosSettings` devolvía la respuesta envuelta en `{data}`, por lo que General nunca mostraba la modalidad, el impuesto ni las propinas guardados y, al guardar, **reescribía** esos valores con los predeterminados (por ejemplo, impuesto 0 y modalidad Restaurante). Se desenvuelve la respuesta (`select`); la terminal heredada ya admitía ambas formas. Severidad media; solo afectaba a quien guardaba desde esa pantalla.

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `.e2e/commerce-phase5-ui.mjs` (nuevo: admin por modalidad, navegación por rol y modalidad, devolución Restaurante, bloqueo, reintento, foco/teclado, cobro en teléfono, avisos, barrido de 4 anchos × claro/oscuro) | 83/83 |
| `.e2e/commerce-restaurant-ui.mjs` (Restaurante y Cocina) | 143/143 |
| `.e2e/commerce-restaurant-integration.mjs` | 41/41 |
| `.e2e/pos-retail-ui.mjs` (Tienda) | 83/83 |
| `.e2e/catalog-integration-validation.mjs` (Catálogo) | 90/90 |
| `.e2e/commerce-gallery-phase3.mjs` | 17/17 |
| `scripts/test-commerce-postgres.mjs` | 195/195 |
| Unitarias (reglas, navegación, estados de conexión, Tienda, SDK) y `@runly/ui` | 26/26 y 5/5 |
| ESLint (`apps/desktop/src`, `packages/ui/src`) y `vite build` | Correctos |

Dos scripts E2E existentes se actualizaron: el de Tienda (el encabezado de Órdenes pasa a «Órdenes» cuando hay una sucursal de Restaurante) y el de Restaurante (diagnóstico opcional de contraste). Contraste y desbordamiento horizontal se midieron en Administración y Órdenes en los 4 anchos y 2 temas.

**No ejecutado o parcial:** objetivos táctiles de 44 px en las pantallas de Administración (se diseñan para escritorio y no se midieron en móvil); lector de pantalla real (la semántica se comprobó por DOM y teclado, no con NVDA, VoiceOver ni TalkBack); tableta, impresora y terminal bancaria reales.

## Consistencia visual

Se reutilizaron `PageHeader`, `Tabs`, `StatusPill`, `SegmentedControl` (`size="lg"`), `PeekSheet`, `FormDialog` y `CommandFailureAlert`; no se creó ningún componente visual nuevo salvo `ConnectionNotice`, que no tiene equivalente compartido. No se hizo un barrido completo de espaciado e iconografía entre módulos; no se detectaron diferencias que justificaran cambiar la identidad aprobada.

## Hallazgos pendientes

| Severidad | Hallazgo |
|---|---|
| Media | Las tarjetas de Administración usan componentes antiguos (botones `size="sm"`, diálogos propios) que no cumplen 44 px en teléfono; es la mayor diferencia visual restante con Tienda y Restaurante |
| Baja | La barra lateral oculta Comandero/Cocina según el contexto de POS cargado; mientras carga, o si el usuario no tiene permiso de contexto, muestra todo |
| Baja | La asignación y edición de mesas existentes (renombrar, deshabilitar) solo está en el plano del salón; Mesas permite crear y marcar limpia |
| Baja | Las rutas heredadas siguen sin ruta pero presentes (ver abajo) |
| Informativa | Avisos de desactualización en Comanda y Cocina siguen siendo los de fase 4 (Cocina ya avisa; Comanda solo con el aviso general) |

## Archivos heredados que Codex puede revisar para retirada segura

- `screens/PosTablesScreen.jsx`, `screens/ComandaScreen.jsx`: sin ruta ni importadores desde fase 4.
- `screens/PosTerminalScreen.jsx` y `retail/LegacyTerminalEntry.jsx`: la ruta `/pos/terminal` muestra «Acceso restringido» a quien no tiene permiso; confirmar si aún es necesaria.
- `components/ComandaLineList.jsx`, `components/ModifierSheet.jsx`, `components/SplitBillDialog.jsx`, `components/OrderPanel.jsx`, `components/TableMap.jsx`, `components/KitchenStationBoard.jsx`, `components/PaymentDialog.jsx` y `hooks/usePosOrder.js`: presumiblemente solo los usaban esas pantallas; verificar importadores antes de retirar. `components/PosModifiersTab.jsx` sigue en uso (Administración).
- `usePosSettings.js` mantiene hooks de órdenes antiguos junto a los vigentes.

No se eliminó nada.

## Veredicto

**APTO para la consolidación técnica final.** La navegación, la administración, las devoluciones de Restaurante, la accesibilidad de la hoja móvil, el acceso al cobro y los avisos de conexión quedaron implementados y comprobados contra PostgreSQL real, sin regresiones en Tienda, Catálogo, Restaurante ni Cocina. Sigue sin validarse hardware físico ni lector de pantalla real. Fase 6: no iniciada.
