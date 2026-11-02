# Runly Commerce Recovery — cierre de integración de Restaurante y Cocina (fase 4)

Fecha: 2026-11-01. Base revisada: `a468c42ce` (presente, sobre `ea17f85fc`). Solo código local y pilas desechables con PostgreSQL real; sin SSH, push ni despliegue. Fase 5 no iniciada.

## 1. Fallos de contraste (causa y solución)

Reproducidos en navegador a 390 px, claro y oscuro. El elemento es `<span>` con «3» de `3 de 3 productos`, el contador de `SellablePanel` (componente compartido con Tienda), no la insignia del chat. Con la hoja de la comanda **expandida**, ese texto queda tapado por el botón «Enviar a cocina (1)» de la hoja (verificado con `elementFromPoint`). El escáner medía el gris del texto contra el fondo teal del botón: 1.49:1 (1.34:1 en oscuro).

Con la hoja **cerrada** el texto tiene contraste correcto (17 textos, 0 fallos) y la última línea de la lista queda libre. Por tanto era un **falso positivo de medición** sobre texto ocluido, no un defecto de color ni de tokens. No se cambió el umbral ni se suprimió la comprobación. El E2E ahora audita por separado (a) la lista con la hoja cerrada, incluida una comprobación de que su última línea no queda cubierta, y (b) el contenido de la hoja abierta. Resultado: 0 fallos en los 4 anchos × 2 temas.

## 2. Defectos adicionales corregidos

| # | Severidad | Defecto | Corrección |
|---|---|---|---|
| 1 | Baja | Si dos meseros abrían la misma mesa, el perdedor veía el aviso pero la pantalla tardaba hasta 8 s en mostrar la cuenta existente | `useTableOrder` invalida las mesas y relee al recibir un conflicto |
| 2 | Baja | Sin conexión, Cocina no avisaba de que el tablero podía estar desactualizado (react-query pausa las consultas, no falla) | Aviso «se muestra el último tablero conocido y puede estar desactualizado» también cuando no hay conexión |

No se hallaron defectos críticos ni altos de seguridad o integridad.

## 3. Pruebas

Ejecutadas (todas contra pila desechable, PostgreSQL real):

| Prueba | Resultado |
|---|---|
| `.e2e/commerce-restaurant-ui.mjs` (4 anchos × claro/oscuro) | **143/143** |
| `.e2e/commerce-restaurant-integration.mjs` (nuevo; revisión independiente verificada en PostgreSQL) | **41/41** |
| `.e2e/pos-retail-ui.mjs` (Tienda) | 83/83 |
| `.e2e/catalog-integration-validation.mjs` | 90/90 |
| `scripts/test-commerce-postgres.mjs` (contratos, transacciones, concurrencia, idempotencia) | 195/195 |
| `.e2e/commerce-restaurant-phase4-api.mjs` (HTTP autenticado) | 20/20 |
| Unitarias (reglas de restaurante, Tienda, SDK) | 22/22 |
| ESLint (POS y `@runly/ui`), `vite build` | Correctos |

Antes de la corrección, el E2E de Restaurante estaba en 133/135 y una primera pasada de la revisión mostró 40/41 (el aviso sin conexión). Ambos se corrigieron y se repitieron completos.

Omitidas o bloqueadas: tableta táctil real, impresora y papel, terminal bancaria, ventas sin conexión (no existen por contrato). No se ejecutó prueba de carga con varias pantallas de Cocina reales; solo se midió el patrón de solicitudes de una.

## 4. Integridad comprobada

- **Mesas y cuentas**: mesas sin plano (0 pisos); una sola cuenta activa cuando dos meseros compiten; el mesero asignado es quien abrió; cambio de comensales persiste con sus asientos; otra empresa no ve mesas ni cocina; una orden no mezcla una mesa de otra sucursal; una pantalla abierta recoge por sí sola cambios de otro dispositivo y su total coincide con el del servidor.
- **Envíos**: secuencias 1, 2, 3 en orden; ninguna partida enviada dos veces; tickets enrutados a la estación de cada producto; respuesta perdida tras commit reintenta con la clave original (1 envío, 1 ticket); variante, modificador y nota verificados en PostgreSQL; el mesero no anula partidas enviadas (403) y el cajero sí (partida anulada y línea de cocina CANCELLED).
- **Cocina**: filtro por estación; saltar estados da 409; dos operadores sobre el mismo toque producen una sola transición (versión 2).
- **Deshacer**: ejecuta la transición inversa que el servidor autoriza y no se muestra como hecho hasta su respuesta. Si otro operador cambió antes, se rechaza con mensaje y PostgreSQL conserva el estado del otro. Si la petición llega pasados los 5 s (retraso inducido de 5.6 s), el servidor la rechaza, la interfaz lo explica y la línea sigue en preparación.
- **Sondeo**: Cocina consulta cada ~5 s (3 solicitudes en 13 s), nunca dos a la vez, se detiene al salir de la pantalla (0 solicitudes en 12 s) y se recupera tras una desconexión mostrando nuevas comandas sin recargar. Las respuestas viejas no pisan las nuevas: las escrituras cancelan consultas en curso antes de fijar el resultado. Es válido para el alcance aprobado; límite: retraso de hasta 5–10 s entre dispositivos y una consulta por pantalla de Cocina (sin medición de carga con muchas).
- **Caja**: cuatro cobros (comensal, partida, importe, saldo) suman exactamente el total (108.36) con impuestos y redondeo (suma de partidas = total y = impuestos); el doble toque en Confirmar crea una sola captura; un pago perdido se reintenta una vez; una cuenta pagada no se vuelve a cobrar; un comprobante de venta; mesa DIRTY solo tras confirmar el pago; cancelar una cuenta sin pagos libera la mesa; la suma atribuida (75.03) no excede lo pagado.
- **Roles y rutas heredadas**: cobro del mesero 403; cocina sin lectura de órdenes 403; permiso revocado con la pantalla abierta produce «Sin permiso» y no añade nada; los escritores heredados de estado de mesa y de ticket responden 409 y el de órdenes 403; `/pos/terminal` muestra «Acceso restringido» a un mesero. Las pantallas `PosTablesScreen` y `ComandaScreen` no tienen ruta ni importadores.
- **Mixta**: alternar Mostrador/Mesas conserva la venta, mantiene la modalidad RETAIL y no duplica sesiones (cubierto en el E2E de Restaurante).

## 5. Hallazgos pendientes (ninguno bloquea el cierre)

| Severidad | Hallazgo | Destino |
|---|---|---|
| Media | Devoluciones de cuentas de Restaurante: el backend las admite, pero Órdenes solo lista y devuelve ventas de Tienda; no hay interfaz. El plan maestro no la declara obligatoria | Fase 5 / Claude |
| Baja | Con la hoja de la comanda abierta en móvil, la lista de atrás sigue accesible por teclado | Fase 5 / Claude (`inert` o `aria-hidden`) |
| Baja | Mesas y Caja no avisan de datos desactualizados sin conexión (solo el aviso general del marco) | Fase 5 |
| Informativa | Ajuste móvil pendiente de POS Tienda: registrado para consolidación; no verificado ni corregido aquí | Fase 5 |
| Informativa | No bloquean: cobro del mesero en su dispositivo, impresión física de comandas, push, tiempo real, plano avanzado, turnos de meseros | Fuera de alcance |

## 6. Ajustes visuales para Claude

Ninguno obligatorio. Los dos de arriba (inerte de la lista tras la hoja y la interfaz de devolución) son de consolidación.

## 7. Veredicto

**APTO técnicamente** para Restaurante y Cocina en el alcance aprobado (mesas sin plano, Comandero, Cocina, Caja con división, Mixta). No equivale a hardware físico validado: faltan tableta táctil, impresora y terminal bancaria reales.

**Fase 5: no iniciada.** Queda a decisión del responsable; esta revisión no la bloquea.
