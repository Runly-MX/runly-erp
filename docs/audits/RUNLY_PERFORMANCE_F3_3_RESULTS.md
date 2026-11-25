# F3.3: blueprints y módulos bajo demanda (primer incremento, parcial)

Fecha: 2026-11-24. SHA del código: `be7165e6b`, `1d538720b` (más `7273cdfb3` para la compresión). Estado: **parcial, nada cerrado.**

## 1. De qué se componía `/blueprints`

Medido con el usuario de pruebas (empresa de pruebas, 30 módulos, 211 filas):

| Concepto | Tamaño |
|---|---|
| Respuesta completa | 3 594 201 B sin comprimir, 880 076 B gzip |
| Filas de tipo HELP (145) | 3 253 KB (90 %) |
| Objeto `module` embebido en cada fila | **3 110 KB (87 %)** |
| de ello, `module.manifest` (44.7 KB por módulo, repetido en cada fila) | casi todo; el manifest ya trae sus propios `blueprints` embebidos (42 KB) |
| Esquemas reales (`schema`) | 342 KB (10 %) |
| Suma de los 30 objetos `module` distintos | 425 KB (se enviaban 3110 KB: **7.3 veces** por duplicación) |

La causa es que las filas del tipo «blueprint» heredado incluyen el módulo completo (`include: { module: true }`) mientras que las vistas de Runly (`runly-view`) ya llevaban un `module` reducido.

## 2. Consumidores

| Consumidor | Qué lee de `/blueprints` | Cuándo |
|---|---|---|
| `ModuleBundleLoader` (shell global) | Solo `module.key`, `has_bundle`, `bundle_hash`/`updated_at`/`version` por módulo | En cada arranque con sesión |
| `BlueprintCrudScreen` (pantalla de módulo genérica) | Filas `source=runly-view` del módulo abierto (`queryKey` ya incluía el módulo, pero pedía todo) | Al abrir un módulo |
| `useRunlyFormRelations` (`@runly/ui`) | Una vista concreta por clave para «crear en línea» | Solo si el usuario abre el alta en línea y no hay filas locales |
| `PublicModuleOutlet`, `storefront-sdk` | `/public/blueprints` (endpoint público distinto) | Sitios públicos |
| `preview-runtime` (Hub) | `client.blueprints.list` en su prueba | Prueba |
| `/runtime/modules` | `useRuntimeModules` (13 llamadores en el shell) y `useEntityBranding` (misma clave de caché) | Arranque con sesión |

Ningún consumidor de ERP lee `module.manifest` de una fila de blueprint (búsqueda en escritorio, `@runly/ui`, SDK, core y module-engine).

## 3. Diseño y cambios

Parámetros **aditivos** de `GET /blueprints` (sin parámetros la respuesta es idéntica):

| Parámetro | Efecto |
|---|---|
| `moduleKey=a,b` | Solo filas de esos módulos |
| `key=x,y` | Solo filas con esas claves exactas (una vista bajo demanda) |
| `kind=FORM,TABLE` | Solo esos tipos |
| `slim=1` | Quita `module.manifest` y `module.lifecycleConfig` (el manifest ya lo sirve `/runtime/modules`) |
| `schema=0` | Quita `schema` (llamadores que solo necesitan metadatos de módulo) |

Se aplican **después** de la autorización (acceso al módulo, módulos desactivados para la empresa) y solo quitan filas o campos: no son un control de acceso ni amplían nada. Código en `apps/api/src/lib/blueprint-query.js` con pruebas (5 casos). La fuente de verdad sigue siendo una (la misma consulta y fusión); no hay endpoint paralelo. SDK: `blueprints.list(token, params)`.

Llamadores migrados: pantalla de módulo (`moduleKey`, `slim`), cargador de bundles (`slim`, `schema=0`) y alta en línea (`key`, `slim`).

## 4. Resultados

Respuestas medidas contra la API con el código nuevo:

| Petición | Sin comprimir | gzip | Reducción |
|---|---|---|---|
| Sin parámetros (comportamiento anterior) | 3 594 201 B | 880 076 B | línea base |
| `slim=1` | 484 682 B | 129 207 B | -87 % / -85 % |
| `slim=1&schema=0` (cargador de bundles) | 131 601 B | 13 172 B | -96 % / -98.5 % |
| `moduleKey=runly.inventory&slim=1` | 45 753 B | 13 911 B | -98.7 % / -98.4 % |
| `moduleKey=runly.calendar&slim=1` | 3 786 B | 1 476 B | -99.9 % |
| módulo inexistente | 11 B | 31 B | vacío, sin error |

En el navegador (escritorio, 3 ejecuciones, instalación limpia, control y candidato contra la misma API con gzip; ambos lados comprimidos):

| Métrica | Control | Candidato |
|---|---|---|
| `/blueprints` en la carga con sesión | 860 KB | **13 KB** (`/blueprints?slim=1&schema=0`) |
| KB transferidos tras iniciar sesión | 1233 | 386 (-69 %) |
| Primera carga con sesión, KB totales | 3493 | 2643 (-24 %) |
| Tiempo hasta interfaz utilizable | 6456 ms | 6975 ms; rangos que se solapan (5990-6778 frente a 5694-7446): **no hay diferencia demostrable** |
| Solicitudes | 41 | 42 |

El ahorro es de transferencia; no se demuestra mejora de latencia en este laboratorio (la base de datos es remota y la medición de tiempo está dominada por otras solicitudes).

## 5. Seguridad y caché

- Los filtros no cambian la autorización: la respuesta es el subconjunto de lo que el usuario ya podía recibir.
- Cabeceras: `private, no-cache`, ETag débil y `Vary: Authorization, X-Runly-Company-Id` (ya desde `7273cdfb3`); la URL con parámetros produce una entrada de caché propia por consulta.
- No verificado en esta pasada: revocación de un módulo con el parámetro `moduleKey` (se apoya en la misma autorización que la ruta completa, sin prueba específica), instalación y desinstalación en caliente, cambio de empresa, cuarentena, deep links y modo sin conexión.

## 6. Presupuestos propuestos

| Concepto | Presupuesto propuesto | Estado |
|---|---|---|
| Metadatos de arranque (`/blueprints?slim=1&schema=0`) | ≤ 20 KB gzip | 13 KB |
| Blueprints de un módulo (`moduleKey` + `slim`) | ≤ 30 KB gzip por módulo típico | 1.5 a 14 KB en los medidos |
| Una vista por clave | ≤ 5 KB gzip | no medido |
| `/runtime/modules` | ≤ 40 KB gzip para el shell | **129 KB gzip hoy: no cumple** |
| Solicitudes de bootstrap | ≤ 4 | no auditado |

## 7. Pendiente de F3.3

- **`/runtime/modules` (488 KB, 129 KB gzip):** 416 KB son `manifest` (que a su vez embebe `blueprints`, `navigation`, permisos); el shell necesita identidad, navegación, estado y revisión. Falta el mismo análisis de consumidores y un parámetro equivalente; no se ha tocado. Tiene 13 llamadores en el shell.
- Bootstrap mínimo real que unifique ambos endpoints con revisión para invalidar caché (ahora cada uno tiene su ETag propio).
- Verificación de revocación, cuarentena, instalación y cambio de empresa con las respuestas filtradas.
- Hub, MCP, offline y hosts nativos como consumidores no auditados.
- F3.3 sobre datos y PostgreSQL (§12 del encargo): cascadas de solicitudes, `sync/pull` (199 KB), N+1, índices y pool: **no iniciado**; la medición necesita una base cercana a la API, no la remota de desarrollo.

## 8. Seguridad de los filtros de /blueprints: estado a 2026-11-24

Estado de la fase: **IMPLEMENTADA, no aceptada.**

Verificado (prueba unitaria `blueprint-query.test.js`, 6/6): para cualquier combinación de parámetros la salida es un subconjunto de las filas ya autorizadas, no aparecen campos nuevos, y un módulo sin acceso responde igual que uno inexistente (sin diferencias de forma, error ni metadatos). `slim=1` solo elimina `module.manifest` y `module.lifecycleConfig`; `schema=0` solo elimina `schema`. Sin parámetros la respuesta es el mismo array.

No verificado (requiere API y datos en ejecución; la API local no estaba levantada y no se arrancó): aislamiento entre dos empresas, usuarios con permisos distintos y revocación en vivo, instalación/desinstalación/actualización en caliente, cuarentena, 304 con ETag por URL, offline y consumidores externos (Hub, MCP).

Procedimiento reproducible: con dos usuarios de empresas distintas, pedir `/blueprints?moduleKey=<módulo del otro>` y comparar byte a byte con `?moduleKey=inexistente`; revocar el permiso y repetir tras invalidar la caché.

## 9. `/runtime/modules?slim=1` (2026-11-24)

Estado: **IMPLEMENTADA, verificada con datos reales a nivel de payload; sin verificar en navegador.**

- Contrato: sin parámetros la respuesta es idéntica. `?slim=1` quita de `manifest` las claves `blueprints`, `permissions`, `acl`, `views`, `models` y `connections` (`apps/api/src/lib/runtime-modules-slim.js`). Se aplica después de autorización, filtro por empresa y filtrado de navegación; no añade nada ni cambia permisos, `authorizedRoutes`, `compatibility` ni el estado. Una sola fuente de verdad: los blueprints siguen en `/blueprints`.
- Qué pesa (40 módulos, 426 KB de manifest): `blueprints` 315 KB (74 %), `permissions` 30, `acl` 23, `navigation` 22, `lifecycle` 13. Ningún consumidor del shell lee las claves quitadas (búsqueda en desktop, `@runly/ui`, core y SDK); el catálogo lee `manifest.lifecycle`, que se conserva.
- Consumidores migrados: `useRuntimeModules` y `useEntityBranding` (comparten la clave de caché `runtime-modules`, ambos piden slim para no mezclar formas). SDK: `runtime.modules(token, { slim: true })`; el valor por defecto sigue siendo la respuesta completa.
- Medición (filas reales de `runly_module` con la misma función, sin `compatibility` ni filtrado de navegación por usuario, por lo que es una aproximación):

| | Sin comprimir | gzip |
|---|---|---|
| Completa | 469 326 B | 128 742 B |
| `slim=1` | 92 086 B | 14 933 B (-88 %) |

Cumple el objetivo de 40 KB gzip. Quedan 14 KB de `lifecycle_config` por fila y 60 KB de manifest (navegación, descripciones) como siguiente margen si hiciera falta.
- Pruebas: `runtime-modules-slim.test.js` (2/2), lint de los archivos tocados limpio, 13/14 de las pruebas de escritorio relacionadas. La que falla, `marketplace-browser`, es una prueba de navegador que da `TimeoutError` también sin estos cambios (necesita servidor web).
- Pendiente: medición en navegador y respuesta HTTP real (API local no levantada), revocación, cambio de empresa, cuarentena y 304 con la respuesta slim (dependen de la misma autorización que la ruta completa, sin prueba específica); consumidores externos (Hub, MCP); catálogo con `lifecycle` y ModuleBuilder no ejercitados en UI. No se mide latencia.

## 10. Validación HTTP real de `/blueprints` y `/runtime/modules?slim=1` (2026-11-25)

Estado: **VERIFICADA LOCALMENTE** (API aislada en 4021, base de desarrollo en solo lectura, usuario de pruebas con dos empresas). Reproducible: `COMPANY_A=<id> COMPANY_B=<id> node docs/audits/perf-f3/scripts/http-contract.mjs <api>`; 17 comprobaciones, todas aprobadas.

| Comprobación | Resultado |
|---|---|
| Sin token: `/blueprints` y `/runtime/modules` | 401 |
| `/runtime/modules` completa (contrato sin parámetros) | 200, gzip, `Cache-Control: private, no-cache`, `Vary` con empresa; 129 178 B gzip / 488 113 B |
| `/runtime/modules?slim=1` | **15 715 B gzip** / 114 640 B (presupuesto 40 KB) |
| slim frente a completa | Mismos módulos y orden; solo difieren las claves omitidas del manifest (`navigation`, `authorizedRoutes`, `compatibility` y estado idénticos) |
| ETag con `If-None-Match` | 304 sin cuerpo; el ETag de una consulta no valida otra (200) |
| Empresa B frente a A | Representación propia (35 frente a 30 módulos); el ETag de A no da 304 para B |
| Empresa a la que el usuario no pertenece | 403 sin datos |
| `/blueprints` sin parámetros | Mantiene `module.manifest` (880 076 B gzip) |
| `/blueprints?slim=1&schema=0` | 13 172 B gzip (presupuesto 20 KB), sin `manifest` ni `schema` |
| Filtrada frente a sin filtrar | Subconjunto de lo ya autorizado |
| Módulo visible solo en A, pedido desde B | Respuesta idéntica a la de un módulo inexistente (vacía) |

**Cuarentena sin ruido, sin ejecución.** El módulo `custom.estrato` está en cuarentena (`NO_TRUST_RECORD`): `GET /modules/custom.estrato/bundle.js` responde **423 `MODULE_QUARANTINED`**, pero el cargador del shell lo pedía y lo registraba como error en cada carga. Ahora `/blueprints` añade `module.quarantined: true` a las filas de módulos con bundle cuya confianza no se cumple (misma comprobación que usa la ruta del bundle, con caché de 5 s) y `ModuleBundleLoader` no los solicita. Es solo una pista para evitar peticiones inútiles: la puerta sigue siendo el 423 del servidor (el script lo vuelve a comprobar) y un fallo en la comprobación no marca nada. Pruebas: `quarantine-flags.test.js`.

**Cachés del cliente.** `useRuntimeModules`/`useEntityBranding` (`["runtime-modules", usuario]`) y el cargador de bundles (`["blueprints", token]`) no llevan la empresa en la clave, pero `applyActiveCompany` ejecuta `clearCompanyQueryCache` en cualquier cambio de empresa, que elimina todas las consultas salvo `instance-status` y `memberships-me`; verificado en navegador (cambio de empresa con el selector real, anexo F3.2). Los dos consumidores de `runtime-modules` piden la misma forma (slim).

**Pendiente:** revocación de permisos en caliente (requiere un segundo usuario con permisos restringidos y mutaciones; no se escribe sobre empresas reales); instalación, desinstalación y actualización de módulos con las respuestas filtradas; Hub y MCP como consumidores; Module Builder y catálogo en uso real de escritura.
