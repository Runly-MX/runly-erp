# Runly Performance F3.4 - Resultados (2026-11-25)

Alcance: Bloque B (uso habitual). Sin push, PR, despliegue, cambios de dependencias ni lockfile. Todo es **análisis estático + pruebas unitarias**; no hubo API ni navegador levantados (los servidores de desarrollo no estaban en marcha y la única base es la remota), así que **no hay mediciones de latencia ni de memoria**.

## Cambios (commits locales)

| Hallazgo | Causa confirmada | Cambio | Evidencia |
|---|---|---|---|
| `GET /notifications/summary` duplicado al iniciar sesión | Al llegar `SUBSCRIBED` de la primera unión a Realtime se invalidaba el resumen recién traído (`refreshNotifications`) | `refreshNotifications(qc, { minAgeMs })`: la primera unión y `visibilitychange` omiten datos con menos de 10 s; los eventos y reuniones posteriores siguen refrescando siempre | `notificationSync.test.js` (5/5), añadido al gate fast. **Medido por lectura de código: -1 solicitud en el arranque**; no verificado en navegador |
| `sync/pull` (199 KB, 2.7 s con contención) compite con Home | El primer `runSync` se lanzaba de inmediato al montar `OfflineProvider` | Primer sync diferido 4 s (`INITIAL_SYNC_DELAY_MS`), con `clearTimeout` en el cleanup | 108/108 pruebas de `packages/offline`. Estimación: libera ancho de banda y conexiones durante la carga de Home; sin medir |
| `sync/pull` ejecuta ~15 consultas en serie | Bucle secuencial sobre handlers | `Promise.all` sobre todos los handlers; el orden de la respuesta es idéntico | `sync-service.test.js` (23/23 junto con otras). Estimación: de N viajes a la base a ~1 (con ~84 ms por consulta a la base remota, hasta ~1 s); sin medir |
| `/user/me` duplicado en login | `refreshProfile` llamaba a `runly.auth.me` sin compartir la petición en vuelo que ya usa `fetchMeOnce` | `refreshProfile` usa `fetchMeOnce` (solo concurrencia, sin caché; clave token + empresa) | pruebas de auth 7/7 |
| Animaciones continuas decorativas | No había regla global de `prefers-reduced-motion` para `animate-ping/bounce/pulse` | Regla en `runtime.css`; los spinners siguen (indican progreso). Login Jaguar intacto | Visual; sin prueba automática |

Gates: **fast y release en verde** (lint, privacidad, scope de empresa, políticas, guards de rendimiento fuente y bundle, contract tests, web build, suites de seguridad). No se repitió la suite general.

## Revisado y descartado (ya correcto)

- Tablas (`RunlyTable`): búsqueda con debounce de 300 ms, preferencias con debounce de 800 ms. Sin cambio.
- Polling del shell: `memberships/me` (120 s) y resumen de notificaciones (120 s, solo con pestaña visible) están acotados; la revisión de Realtime comparte un único poll por cliente.
- Contactos: lista y conteo ya en `Promise.all`; no se encontró findMany + count secuencial en los servicios revisados.
- `/user/me` y `/runtime/modules`: ya deduplicados/slim (Bloque A).

## No hecho (necesita infraestructura o decisión)

- **Payload de `sync/pull`**: cada registro viaja con la fila completa (`data: row`, sin `select`). Reducirlo exige saber qué columnas leen las pantallas offline (contactos, RH, flota, calendario, catálogo); se necesita medir por entidad con datos reales. Además `hasMore` no lo usa el cliente y el cursor único es el máximo de todas las entidades: si una entidad supera 500 filas, las siguientes páginas podrían omitir registros de otra. **Riesgo existente, no tocado** (cambia el contrato offline).
- EXPLAIN / N+1 en inventarios, compras, archivos y calendario: sin base cercana a la API; no se midió. Los listados de inventario son modelos RME3 con SQL crudo; no revisados.
- Perfil de React, memoria/fugas (heap, listeners, WebSockets, object URLs), móvil con throttling, coste de `backdrop-blur` (~100 usos) y layout thrashing: requieren navegador con API en marcha. No se afirma nada.
- Sin pruebas en dispositivo físico.

## Riesgos

- Diferir el sync 4 s retrasa 4 s el primer push de mutaciones offline pendientes al abrir la app (los cambios de red posteriores sí disparan sync inmediato).
- Paralelizar handlers sube la concurrencia puntual sobre el pool de Prisma (~15 consultas); si el pool es pequeño solo se encolan.
