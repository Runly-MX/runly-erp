# Runly Commerce Recovery — fase 6: validación final y preparación de piloto

Fecha: 2026-11-01. Base: `4f8c86a56` (cierre técnico de fase 5, confirmado presente). Trabajo local sobre `main`, árbol limpio al inicio, sin ramas, SSH, push ni despliegue; solo pilas desechables con PostgreSQL y datos sintéticos.

## Veredictos (independientes)

- **SOFTWARE: APTO.** Todos los recorridos esenciales de Tienda, Restaurante y Mixta funcionan y se verificaron en PostgreSQL; integridad, permisos y pruebas pasan; no quedan defectos críticos ni altos.
- **PILOTO OPERATIVO: PENDIENTE DE VALIDACIÓN FÍSICA.** Faltan las pruebas con lector de pantalla real y con hardware (tableta, lector de códigos, impresoras, terminal bancaria, varias pantallas de Cocina, corte de red real). No se simuló ninguna. El procedimiento y la matriz están en [`2026-11-01-commerce-phase6-manual-validation.md`](2026-11-01-commerce-phase6-manual-validation.md).

## Commits y estado del repositorio

Un único commit de fase 6 (corrección y regresión de seguridad más estos dos documentos), identificable con `git log -1 --format=%h -- docs/superpowers/plans/2026-11-01-commerce-phase6-results.md`. Los guiones de pruebas (`.e2e/`) son procedimientos locales ignorados por Git, como en fases anteriores. Árbol limpio tras el commit; sin push.

## Defecto encontrado y corregido

| Severidad | Defecto | Causa | Corrección | Regresión |
|---|---|---|---|---|
| **Media (autorización)** | Un rol de servicio de mesas (solo `pos.comandas.*`) podía **abrir una venta de mostrador** (RETAIL) sobre la sesión de un cajero y **añadir o quitar partidas del carrito de mostrador** de otra persona. No podía cobrar, pero sí alterar un carrito en curso | Crear y editar órdenes aceptaba `pos.comandas.create` también para el mostrador | En el comando de órdenes, una orden RETAIL (crear, añadir, cambiar, quitar partida) exige `pos.orders.create`, `pos.orders.update` o `pos.caja.operate` (o administrador); Restaurante no cambia | Prueba versionada en `pos-retail-phase3-postgres.test.js` (PostgreSQL 195 → 196) y comprobaciones M5/M5b del recorrido de Mixta |

Se encontró con el recorrido de Mixta (comprobación «un mesero no puede crear una venta de mostrador»), falló, se reprodujo con una petición autenticada y se corrigió con el cambio mínimo en `pos-v2-routes.js`, sin tocar contratos ni migraciones. Todos los E2E se repitieron después de la corrección.

Fallos de **mis guiones** (no del producto) corregidos durante la preparación: fixtures sin estación para productos no preparados, nombre del campo de revisión del Catálogo y un selector de la prueba de memoria.

## Recorridos comprobados (todo verificado en PostgreSQL)

**Tienda** (`commerce-phase6-journeys`, 15 comprobaciones): edición del carrito y descuento autorizado reprecian en el servidor; sin permiso de descuento 403; pago parcial en efectivo con cambio y reenvío con la misma clave sin segunda captura; tarjeta sin referencia rechazada, con referencia cierra la orden con un comprobante; existencias bajan una vez por unidad; devolución con el importe del preview y la unidad regresa a existencias; devolución vieja o excesiva rechazada; cancelación sin movimiento de existencias; producto sin existencias no se vende; **la última unidad vendida en dos cajas a la vez cobra una sola**; el efectivo esperado coincide con apertura + ventas − devoluciones y el cierre con ese conteo queda sin diferencia; una caja cerrada no acepta pagos.

**Restaurante** (journeys + `commerce-restaurant-ui` 143 + `commerce-restaurant-integration` 41 + `commerce-phase5-ui` 83): mesero sin sesión toma y envía; productos no preparados no van a Cocina; división por comensal, por importe, por partidas y saldo suman exactamente el total (200.00 = 200.00); un asiento cubierto no se cobra otra vez; mesa DIRTY solo tras el pago final; devolución con atribuciones dentro de lo neto pagado; segunda persona en mesa ocupada rechazada; envíos 1, 2, 3 sin partidas repetidas; Cocina con varios operadores (una transición por toque), deshacer válido/inválido/tardío; Floor Planner opcional; devolución de Restaurante desde Órdenes con reintento sin duplicar.

**Mixta** (6 comprobaciones): una caja y una sesión atienden mostrador y mesas; cada orden conserva su modalidad (RETAIL / RESTAURANT); el mismo producto del catálogo común baja existencias una vez por venta (2); un único conteo de efectivo concilia ambas; mesero sin permisos de mostrador; cajero sin permiso para cambiar la modalidad.

**Catálogo** (`catalog-integration-validation` 90 + 4 comprobaciones nuevas + galería 17): alta, edición, variantes, SKU y código de barras, precio propio y heredado, disponibilidad por sucursal, publicación web independiente, impuestos, existencias, ajustes y asignaciones, galería, portada, carga múltiple y orden. Nuevo: un PATCH de solo nombre cambia únicamente el nombre y uno de solo precio cambia solo el precio (comparando la fila completa en PostgreSQL); una revisión vieja se rechaza con 409 (no se mezcla); cada movimiento de existencias tiene origen o motivo.

**Seguridad e integridad**: aislamiento por empresa (mesas, cocina, órdenes) y por sucursal (mesa de otra sucursal, caja de otra sucursal); permiso revocado corta el mismo token (403); concurrencia de existencias, de mesas, de Cocina y de pagos; idempotencia con reintentos; escritores heredados rechazados (409/403); datos históricos conservados (migraciones sin tocar).

## Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| Recorridos de Tienda, Restaurante, Mixta, Catálogo y seguridad (nuevo `commerce-phase6-journeys`) | 34/34 |
| POS Tienda en navegador (4 anchos × claro/oscuro) | 83/83 |
| Restaurante y Cocina en navegador (4 anchos × claro/oscuro) | 143/143 |
| Integración de Restaurante (PostgreSQL) | 41/41 |
| Fase 5: Administración, navegación, devoluciones, foco, cobro móvil, avisos | 83/83 |
| Catálogo (navegador y API) | 90/90 |
| Galería | 17/17 |
| Contratos PostgreSQL (migración, transacciones, concurrencia, idempotencia, scope, RLS) | 196/196 |
| HTTP autenticado: Tienda / Restaurante | 22/22 y 20/20 |
| Unitarias (POS, reglas, SDK, `@runly/ui`, contratos API) | 123/123 |
| ESLint (`apps`, `packages`, `scripts`) y `vite build` | Correctos |
| Privacidad | 67 hallazgos de política, los mismos que antes; 0 nuevos |

Nota de lint: `eslint .` en la raíz reporta 1 error en `.e2e/bridge-fixture-code.js`, un fixture local ignorado por Git y ajeno a esta entrega; los directorios versionados pasan limpios. No se redujo cobertura, no se deshabilitó ninguna prueba ni se relajó un umbral. El único cambio a pruebas existentes fue añadir la regresión de seguridad.

**No ejecutado**: lector de pantalla real, hardware físico y turno real con personas (ver matriz). No se corrió una suite completa de todo el monorepo (`node --test` global) porque excede el alcance de Commerce; se ejecutaron las suites de Commerce, POS, Catálogo, SDK y `@runly/ui`.

## Desempeño y operación (observaciones de este equipo)

Equipo: 16 CPU lógicas (portátil i7 de 13.ª generación), 32 GiB, Windows; API, PostgreSQL en Docker y Chromium en el mismo host. **Son observaciones locales, no una capacidad garantizada de producción.**

| Prueba | Resultado observado |
|---|---|
| Alta de 1,200 productos (25 en paralelo) | 3.2 s (≈370/s) |
| Paginación de 1,200 productos (40 páginas de 30) | p50 19 ms · p95 28 ms · máx 30 ms; sin duplicados ni huecos |
| 40 búsquedas consecutivas | p50 19 ms · p95 27 ms |
| 60 escaneos consecutivos | p50 15 ms · p95 21 ms · 60/60 exactos |
| 60 ventas sucesivas (orden + línea + pago) | p50 157 ms · p95 219 ms · máx 339 ms |
| 20 ventas simultáneas | 2.6 s en total; 20/20 cobradas una vez |
| 25 mesas en paralelo con 3 envíos cada una | 2.1 s en total; envío p50 196 ms · p95 302 ms; 75 envíos, 0 partidas repetidas |
| Cola de Cocina con 75 comandas, 5 pantallas × 12 consultas | p50 28 ms · p95 57 ms |
| Dos operadores sobre las mismas 20 líneas | 20/20 primeros movimientos ganaron; 20 intentos rechazados |
| Navegador: 10 cargas completas de Cocina/Mesas/Órdenes | memoria JS tras GC 21.6 → 21.4 MiB; nodos DOM 1872 → 1872 |
| Navegador: 100 viajes de navegación interna sin recargar | memoria 21.4 → 23.9 MiB (≈ +2 MiB de calentamiento, luego +0.1 MiB por 20 viajes); nodos DOM 1872 → 1882 estables; escuchas 462 → 459 |

Límites: catálogos de 1,200 productos y 25 mesas, no de decenas de miles; una sola máquina; red local sin latencia. Una medición intermedia con 4,042 nodos DOM resultó transitoria (no se reprodujo en la serie de cinco bloques).

## Accesibilidad

Comprobado en navegador, claro y oscuro, 390×844, 768×1024, 1024×768 y 1440×900: contraste, sin desbordamiento horizontal, objetivos táctiles (≥44×44 px en Tienda, Restaurante, Cocina y Administración móvil según fase 5), foco atrapado y devuelto en hojas móviles, teclado, avisos de estado, «Cobrar» y «Enviar» accesibles con la hoja colapsada. **Lector de pantalla real: NO probado**; no se afirma. Pruebas de DOM, ARIA y teclado complementan, pero no sustituyen, el procedimiento A de la matriz manual.

## Hardware

Ningún dispositivo real se probó. **No hay integración bancaria**: la tarjeta registra el pago con su referencia manual. La impresión llega hasta «enviado al transporte» (navegador o Bluetooth); el software no puede confirmar el papel. Ver matriz B.

## Riesgos y limitaciones

- Migraciones de fases 1 a 4 sin aplicar a una instalación existente con datos reales: requieren respaldo previo y ensayo.
- Lector de pantalla y hardware sin validar.
- No hay ventas sin conexión ni cobro desde el dispositivo del mesero (fuera de alcance aprobado).
- Capacidad medida solo localmente.
- Limitaciones heredadas aceptadas: sondeo de 5–10 s en lugar de tiempo real, sin notificaciones push, sin impresión de comandas desde Cocina en la interfaz.

## Acciones para el usuario

1. Ejecutar la matriz de [`2026-11-01-commerce-phase6-manual-validation.md`](2026-11-01-commerce-phase6-manual-validation.md) (lector de pantalla A, hardware B, operación de piloto C) y registrar APRUEBA/RECHAZA con evidencia.
2. Respaldar y ensayar las migraciones en una copia de la base de la empresa piloto; luego hacer el push y el despliegue por el flujo habitual (esta fase no lo hace).
3. Elegir la empresa y la fecha del piloto y la persona que revisará el corte de caja del primer turno.
4. Si algún punto de la matriz RECHAZA, enviar la evidencia: sería un defecto nuevo, no un reabrimiento de las fases anteriores.

No se abre otra fase de implementación: el software queda cerrado a la espera de la validación física.
