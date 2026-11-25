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

---

# Anexo B.2 + C (2026-11-25)

## Integridad de sincronización offline: defecto reproducido y corregido

**Reproducción** (`sync-pagination.test.js`, tabla en memoria con el filtro `updatedAt > cursor` de Prisma, contra el código anterior): con 600 empleados y 10 departamentos más recientes, el cliente recibía **510 de 610** registros; con 700 filas y empates de `updatedAt` en el límite de página, **636 de 700**. Causa: un cursor único igual al máximo de **todas** las entidades (los 90 empleados restantes quedaban detrás del cursor) y filtro `gt` con empates en el borde. Además el cliente ignoraba `hasMore`.

**Corrección compatible con el contrato** (`{records, nextCursor, hasMore}` sin cambios; clientes anteriores siguen funcionando, solo que ahora no pierden filas): cuando una entidad se trunca, `nextCursor` es el de esa entidad menos 1 ms (mínimo entre las truncadas); las filas reenviadas son upserts idempotentes. El cliente repite el pull mientras `hasMore` y el cursor avance (máx. 20 páginas) y para si el cursor no avanza. Resultado: 610/610 y 700/700. Pruebas: 2 de servidor y 2 de motor, añadida la de servidor al gate fast.

**Por qué no hay pérdida en la práctica sin la corrección:** solo se pierde con más de 500 filas en una entidad dentro de una misma ventana de cursor, es decir, primera sincronización de empresas grandes. No se afirma pérdida real en producción; sí está reproducido el mecanismo.

**No verificado / no tocado:** los handlers siguen devolviendo `deleted:false` siempre (no hay tombstones: un borrado duro en servidor no se propaga al caché offline; es un límite de diseño preexistente, no una regresión); una fila pull que llega con `dirty:true` local se sobrescribe con `dirty:false` (la mutación sigue en la cola y se reenvía; no se probó el efecto visual); cambio de empresa y revocación se apoyan en el scope por empresa del servidor y el borrado de caché por empresa (`sync-company-scope.test.js` ya existente); con más de 500 filas empatadas en el mismo milisegundo el cursor no avanza y el pull se detiene (límite documentado, improbable).

## Revisión de las cuatro optimizaciones

- **Notificaciones:** la ventana de 10 s solo aplica a la primera unión a Realtime y a `visibilitychange`; reconexiones posteriores, eventos y cambio de empresa (caché limpiada) siguen refrescando siempre. **Defecto encontrado y corregido:** un refresco final pendiente tomaba el `minAgeMs` de la primera llamada, de modo que un evento podía quedar absorbido por una reconciliación tolerante; ahora toma el más estricto.
- **Perfil:** `fetchMeOnce` solo comparte peticiones concurrentes con la misma clave `token|empresa` (nunca entre usuarios, nunca caché), se elimina en `finally`, y `refreshProfile` conserva sus comprobaciones de identidad y empresa tras la respuesta (descarta si cambió la identidad o la empresa). Sin cambios necesarios.
- **Sync diferido:** con mutaciones pendientes el sync (push y luego pull, en la misma secuencia, sin carreras) arranca de inmediato; el retraso de 4 s solo afecta cuando no hay nada que subir. Paralelismo de handlers **limitado a 4 consultas simultáneas** por petición.
- **Reduced motion:** `animate-pulse` se **retiró** de la regla (es un parpadeo de opacidad que usan los skeletons como indicador de carga); solo se detienen `ping` y `bounce`. Los spinners siguen.

## Dependencias y calidad

- La otra sesión ya resolvió: React/React DOM 19.3.1 único, todos los `latest` congelados con puerta de CI, `lucide-react` 1.59.0 en `ui` y `desktop`, Atlas 0.11.1. Verificado (gate de política de dependencias en verde); no se tocaron `package.json` ni el lockfile.
- **Catálogo de runtime regenerado** (react 19.3.1, react-dom 19.3.1, react-query 5.104.4, lucide 1.59.0) junto con `docs/developers/librerias.md` y el snapshot de documentación del Builder; `module-runtime-catalog.test.js` y `developer-docs.test.js` pasan (8/8). Pendiente en otros repositorios: `sync-help-content.mjs` en runly-web y `sync-mcp-docs.mjs` en el Hub (no se ejecutaron: modifican otros repositorios).
- Fallos restantes del Bloque A: el catálogo de runtime queda resuelto; quedan 5 de Postgres de Website (Docker) y la prueba de navegador del Marketplace (requiere servidor web).

## Licencias, SBOM y avisos (preliminar)

Ver `RUNLY_LICENSE_INVENTORY_PRELIMINARY.md` (sección final) y `docs/THIRD_PARTY_NOTICES.md`. Resumen: `country-state-city` es GPL-3.0 en código con datos ODbL de `dr5hn`; `ffmpeg-core.wasm` está compilado con `--enable-gpl` (x264, x265, libvpx, LAME...), y solo el MP4 de respaldo de Studio necesita un componente GPL. Hay propuestas, no cambios, pendientes de decisión jurídica. SBOM: npm completo de producción (1153 paquetes); Rust parcial (625 crates por nombre y versión, licencias sin verificar); contenedores, binarios, fuentes e imágenes pendientes.

## Pendiente

React compartido (perfiles y memoria), Marketplace en navegador, Postgres de Website en Docker, SBOM de contenedores y de Atlas/Hub, sincronización de documentación en runly-web y Hub, validación del campo `file` de audio/video dentro del Hub, y las decisiones sobre `country-state-city` y FFmpeg.
