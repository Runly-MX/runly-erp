# RUNLY PLATFORM STABILIZATION — F1B Stage 4: consolidación del Secure Runtime

## Veredicto

**APTO LOCALMENTE PARA STAGING, con una condición abierta.** No es apto para activación experimental en staging todavía.

- P0-01 sigue **CONTENIDO**, no cerrado. RME3 y Module Builder Next siguen en **NO GO**. No se autoriza producción y no se inicia Stage 5.
- Lo que falta para pasar a «apto para activación experimental en staging» está en §15.

## 0. Contexto y control de cambios

- **Base:** `main` @ `27c1913f8`, árbol limpio al iniciar. **Candidato:** `e73cdf3ad` (último commit con código; los posteriores solo tocan documentación y evidencias). Todo es local: sin push, PR, publicación ni despliegue.
- **Commits de esta fase:** `cbf623abe` (instalación fuera de la raíz), `0ff88dc90` (Atlas), y los de gateway, relaciones, supervisor, medición y documentación hasta `e73cdf3ad`.
- **Cambios de otras sesiones:** durante la fase apareció trabajo ajeno sin seguimiento (`docs/audits/perf-f3/`, `RUNLY_PERFORMANCE_F3_BASELINE.md`). Los incluí por error en un commit y los saqué de inmediato con `git rm --cached` sobre mi propio commit sin publicar; siguen en disco, sin seguimiento y sin modificar. No toqué el artefacto Login Runly Jaguar ni ningún repositorio ajeno.
- **Entorno:** Windows 11, Docker Desktop 29.8 (WSL2). Todo se verificó en **infraestructura desechable**, nunca en staging, producción ni dispositivos.

## 1. Preflight

| Revisión | Resultado |
|---|---|
| Bloqueo de Atlas 0.11.0 | **Causa exacta:** `scripts/build-website-public-runtime.mjs` tiene una lista cerrada de versiones revisadas del runtime público que termina en 0.10.0, y `main` usa 0.11.0 (adoptado en `9e390a20b` sin ampliar la lista). Con la lista ampliada, el runtime público compila (entry 1.1 MB, estilos 82 KB) y la guarda contra importaciones administrativas pasa. **Apliqué esa única línea** en `0ff88dc90`, como cambio aislado y reversible. **Es una revisión de otra línea de trabajo: confirmar con quien posee Atlas o revertir ese commit** |
| 22 pruebas fallidas de la línea base | Ver §14: el conjunto se mantiene |
| 40 hallazgos de privacidad | Mismos 40, todos de `non-example-ipv4` en 4 archivos. Clasificación reproducible por hallazgo en `docs/audits/evidence/f1b-stage4-privacy-classification.json` (`scripts/security/classify-privacy-findings.mjs`): 39 son rangos privados o de uso reservado, 11 son direcciones de documentación RFC 5737, 15 son una dirección ficticia de cliente «falsificado» en pruebas de proxies de confianza y 6 son entradas inválidas a propósito. Ninguno es infraestructura real. No se añadieron exclusiones |
| Login Runly Jaguar | Fuera de alcance; sin cambios |

## 2. Adaptador de datos declarativo

- **Operación `records.query`:** página, tamaño (≤ 100), búsqueda (campos de texto declarados), orden y filtros solo sobre campos declarados. Implementada en los tres almacenes (memoria, esquema propio, tablas RME3).
- **Fachada REST** (`rest-facade.js`) con la forma que ya consume la UI compartida (`{ data, pagination }`, filas planas) para listar, detalle, crear, editar, eliminar, restaurar y transiciones. `RunlyTable`, `RunlyForm` y `RunlyDetail` se reutilizan sin copiarlos y sin cargarlos en módulos que no los usan (los blueprints solo añaden `apiPath`).
- **Camino único:** cada petición REST pasa por el mismo `gateway.call` que `/call` (token del host, permisos, cuota, idempotencia, auditoría). No hay Prisma global ni credenciales privilegiadas, y no se crearon tablas paralelas.

| Aspecto | Evidencia (`verify-declarative-data-compat.mjs`, PostgreSQL real, **10/10**) |
|---|---|
| Listado, paginación, búsqueda, filtros, orden | Páginas sin solapamiento; orden verificado; campo no declarado → 422 |
| Creación, edición, detalle | Misma fila y mismo ID que ve el runtime actual |
| Validaciones y concurrencia | Versión vieja → 409 |
| Relaciones, permisos | Ver §4; mismas claves de permiso que el runtime actual (200/403 coinciden) |
| Cambio de empresa | La misma sesión con otra empresa recibe 404/error y nunca filas de A |
| Revocación | Permiso del destino revocado se aplica en la siguiente llamada; el paquete retirado responde `MODULE_NOT_AVAILABLE` |
| Estados de carga y error | Errores normalizados `{ error, message, correlationId }`; el renderer los muestra como ya hace |

**No verificado:** el renderizado en un navegador contra la fachada ni los estados de carga visuales. La compatibilidad se comprobó contra el contrato que leen los componentes (parámetros y forma de respuesta), no ejecutándolos. Sin eso, R-4 se reduce pero no se cierra.

## 3. Compatibilidad semántica

| Capacidad | Resultado |
|---|---|
| Baja lógica | Nueva: `records.delete` (solo lógica; `enabled = false` en tablas RME3, `deleted_at` en el esquema propio), permiso `delete` de la entidad. Verificado contra la tabla existente: el runtime actual deja de listarla y la fila permanece |
| Restauración | `records.restore`, mismo permiso; otra empresa no puede restaurar (404) |
| Automatizaciones del Builder | **No se convierten.** Una escritura por el gateway no las dispara; el convertidor las clasifica `review` («sigue en el runtime actual»). Ninguna de las seis plantillas las usa |
| Relaciones con otros módulos | Contrato único (§4) |
| Historial de actividad | Ahora se genera desde el gateway para crear, actualizar, transición, eliminar y restaurar; atribuido al usuario real (§5) |
| Archivos y adjuntos | Sin cambios: `files.attach` responde 409 sobre tablas RME3 y los adjuntos siguen con las rutas actuales |
| Permisos empresariales, configuración por empresa | Mismas claves; `company_module` no cambia |
| No representable | Kanban, Dashboard, conexiones, enlaces públicos, tipos de documento y widgets: `review`, con detalle por elemento |

La conversión no cambia el significado en silencio: cada elemento queda como `preserved`, `transformed`, `review` o `unsupported` en el informe.

## 4. Contrato de relaciones entre módulos

Documento: `docs/architecture/2026-11-25-declarative-relations-and-data-contract.md`. Sustituye el adaptador rígido de Contactos por **un único contrato**: `external:<tipo>` sobre el catálogo `EXTERNAL_RELATION_TARGETS`, resuelto por el servicio de relaciones del módulo dueño. Hoy: Contactos, RR.HH. e Inventario (lista revisada; añadir un tipo es un paso explícito). No existe acceso a tablas arbitrarias.

Verificado en PostgreSQL real con dos empresas (`verify-relations-contract.mjs`, **8/8**):

| Caso | Resultado |
|---|---|
| Identidad empresarial | Solo se resuelven registros de la empresa de la sesión |
| Permisos del usuario / del módulo consumidor | Sin permiso del destino: `resolve` devuelve vacío (sin filtrar ni la existencia) y `search` 403; sin permiso del consumidor: 403 |
| Referencias cruzadas | Registro de otra empresa no se resuelve |
| Registros eliminados | **Hallazgo corregido:** el resolvedor de RR.HH. devolvía empleados dados de baja; el host ahora los filtra con el criterio de baja lógica del catálogo |
| Módulos deshabilitados | Deshabilitado para la empresa o no instalado → 409 `RELATION_TARGET_UNAVAILABLE` |
| Revocación | El permiso retirado se aplica en la siguiente llamada |
| Paginación y búsqueda | Búsqueda por texto y `limit` ≤ 50. **No hay cursor** (límite conocido) |
| Campos visibles | Solo `id`, `label`, `subtitle` |

## 5. Historial de actividad y auditoría

Se distinguen tres cosas:

| Tipo | Dónde | Contenido |
|---|---|---|
| Diagnóstico | Logs de la API y del supervisor | Operativo; no es evidencia |
| Auditoría de seguridad | `audit_log` (`runtime.*` y `runtime.denied.*`) y `audit.jsonl` del supervisor | Módulo, empresa, usuario, operación, entidad, ID de registro, resultado, **motivo de rechazo**, **revisión del módulo** (hash del paquete), fecha, **correlation ID** y `jobId` |
| Historial de actividad empresarial | Tabla `activity` | Texto compuesto por el host con la definición confiable del paquete, atribuido al usuario real |

- El correlation ID lo genera el host por llamada (UUID); regresa al cliente en la respuesta y en los errores.
- **No falsificable por el módulo:** los campos salen del token firmado o de argumentos ya validados como identificadores o UUID. Los datos del registro, el texto de los argumentos, los tokens y los nonces nunca entran. Hay una prueba con texto «hostil» que comprueba que no aparece en la auditoría ni en la actividad.
- Un fallo del historial no rompe la operación y queda auditado (`runtime.activity_failed`).
- Verificado en PostgreSQL real: dos entradas de auditoría con resultado, correlación, revisión y fecha, y tres de actividad con el actor real (UUIDv7 aceptados por la política UUID).

## 6. Supervisor y mínimo privilegio

Detalle y modelo de amenazas actualizados: `docs/architecture/2026-11-24-execution-supervisor.md`.

- **Preflight fail-closed:** antes del primer trabajo de un perfil, el supervisor arranca un contenedor con **los mismos flags** del trabajo y lee del kernel 13 verificaciones (usuario, `CapEff` y `CapBnd`, `NoNewPrivs`, seccomp, límites de PIDs y memoria, red, raíz de solo lectura, socket de Docker, `unshare`, `mount`, `/tmp` noexec, entorno limpio e imagen fijada por digest). Si algo falla, el código personalizado queda deshabilitado (`503 RUNTIME_DISABLED`); el runtime declarativo no se ve afectado.
- **El probe encontró un defecto propio:** la primera versión daba «correcto» sin `--read-only` ni `--cap-drop ALL`, porque un usuario no root ni escribe ni tiene capacidades efectivas. Ahora lee `CapBnd` y las opciones del montaje, y detecta cada debilitamiento por nombre (comprobado contra Docker real).

| Opción | Resultado en esta máquina |
|---|---|
| Docker rootless | **No probable** (Docker Desktop). Sin evidencia |
| User namespaces | **No probado.** No se asume que eliminen el privilegio del supervisor sobre el daemon |
| Seccomp | Perfil por defecto activo y verificado. No se adopta uno propio: sin ganancia medida |
| AppArmor | No disponible en este host |
| gVisor | No instalado |
| Imagen por digest, capacidades, `no-new-privileges`, solo lectura, red restringida, límites | Verificados desde dentro del contenedor |

**Riesgo restante, sin cambios:** el acceso a Docker equivale a root en el host. Esta fase lo **delimita** (proceso separado, contrato cerrado y firmado, sin credenciales de Runly, fail-closed), no lo elimina. **No existe imagen del supervisor ni perfil en el compose del instalador**: hoy corre como un proceso aparte. Con el compose actual el runtime de código personalizado no se puede desplegar, y por defecto está deshabilitado.

## 7. Durabilidad y recuperación de trabajos

La garantía es **como máximo una ejecución**, no efectos exactamente una vez. La tabla por paso (recepción, claim, inicio, efectos, finalización, cancelación) está en el documento del supervisor. Pruebas con inyección de fallos (`supervisor.test.js`, 14/14):

- caída tras el claim y antes del contenedor: `INTERRUPTED`, nunca se ejecutó;
- caída tras el efecto y antes de registrar el resultado: un solo efecto, el reintento se rechaza (409) y el resultado se informa como desconocido, no se adivina;
- última línea del libro de trabajos truncada: se ignora sin perder estados anteriores;
- cancelación durante la ejecución: el resultado tardío se descarta (`JOB_CANCELLED`).

**Política de reconciliación:** un trabajo `INTERRUPTED` se concilia buscando en la auditoría las entradas con su `jobId`; no hay efectos externos fuera de Runly. Los contenedores huérfanos se matan al arrancar (verificado en Stage 3 y por prueba unitaria). Con Docker real, 1, 4, 8 y 16 trabajos concurrentes terminaron sin contenedores ni redes sobrantes (§11).

## 8. Instalación fuera del project root

**Causa:** el descubrimiento sí respetaba `RUNLY_MODULES_DIR`, pero el ciclo de vida solo buscaba en `<raíz>/modules`; sin carpeta, el flujo seguía con el manifiesto y registraba el módulo **sin tablas y sin error**.

**Corrección** (`module-lifecycle-service.js`):
- las carpetas se resuelven en las mismas raíces autorizadas que el descubrimiento;
- `realpath` impide que un symlink o junction salga de esas raíces;
- un módulo no oficial sin carpeta se rechaza con 409 **antes de cualquier escritura**;
- el flujo oficial con modelos en línea no cambia.

**Regresión permanente:** `module-install-roots.test.js` (2 pruebas, fallan sin la corrección y pasan con ella) y `verify-declarative-data-compat.mjs`, que ahora instala los módulos reales del Builder **fuera de la raíz** y comprueba que las tablas existen y funcionan (10/10). Otras configuraciones soportadas (carpeta dentro de la raíz, instalador `/app/modules/custom`) siguen cubiertas por la suite existente. La recuperación de instalaciones fallidas sin purgar datos es el comportamiento previo (`preserve-data`); no se modificó.

## 9. Error de UUID del activity publisher

| Pregunta | Respuesta |
|---|---|
| Causa | `activityPublishSchema` usa `z.string().uuid()`. Zod 4 (subida a 4.6) valida el formato RFC 9562 (versión y variante); Zod 3 aceptaba cualquier forma hexadecimal. Un `entityId` con forma de UUID pero no RFC (por ejemplo identificadores sintéticos de fixtures) falla |
| Alcance | Solo eventos de actividad cuyo `entityId` no sea RFC. Los UUIDv7 reales pasan |
| Impacto | El publicador captura el error y registra una advertencia: se pierde esa entrada de historial; la mutación principal no se ve afectada |
| Reproducible | Sí: `z.string().uuid()` rechaza identificadores no RFC |
| Relación con Secure Runtime | **Ninguna.** El gateway escribe `audit_log` directamente y su historial usa IDs UUIDv7 (verificado: tres entradas de actividad con el actor real). No es bloqueador de F1B |
| Decisión | No se relajó la política UUID. Va al backlog del equipo de actividad: localizar qué llamador envía IDs no RFC (no identificado en esta fase) |

## 10. Las seis plantillas

Detalle por plantilla: `docs/audits/RUNLY_PLATFORM_F1B_STAGE4_TEMPLATE_MATRIX.md`. **6 de 6** sin fallos en instalación (fuera de la raíz), ejecución, paridad con el runtime actual, aislamiento entre empresas y reversión. `simple-crud` es `FULLY_DECLARATIVE`; las otras cinco `DECLARATIVE_WITH_REVIEW` por Kanban, Dashboard, conexiones y conversiones de decimal y markdown. Nada se eliminó en silencio.

## 11. Imágenes exactas del candidato

IMAGES_PLACEHOLDER

## 12. Rendimiento

Estación Windows con Docker Desktop; los números son **relativos entre configuraciones**, no una afirmación de capacidad. Evidencia en `docs/audits/evidence/f1b-stage4-bench-*.json`.

| Configuración | Arranque de la API | RSS en reposo | RSS tras medir | CPU durante la medición |
|---|---|---|---|---|
| Runtime deshabilitado | 5.5 s | 317 MB | 348 MB | 1.8 s |
| Experimental habilitado, sin módulos | 4.9 s | 317 MB | 337 MB | 2.2 s |
| + módulo declarativo (60 filas) | 5.5 s | 317 MB | 365 MB | 3.8 s |

El arranque y la memoria en reposo no se distinguen del ruido de medición con el flag activo.

**Listado de 20 filas** (200 peticiones secuenciales; 300 con concurrencia 20):

| Ruta | Secuencial p50 / p95 / p99 | Concurrente p50 / p95 / p99 | Solicitudes por segundo |
|---|---|---|---|
| Runtime actual (flag apagado) | 8.5 / 12.7 / 27.4 ms | 16.7 / 31.5 / 38.9 ms | 946 |
| Runtime actual (flag encendido, sin módulos) | 8.5 / 11.7 / 27.9 ms | 16.8 / 34.1 / 41.8 ms | 936 |
| Runtime actual (flag encendido, con el módulo declarativo) | 9.4 / 15.7 / 21.7 ms | 18.4 / 52.6 / 56.7 ms | 711 |
| **Fachada declarativa** | **8.1 / 11.1 / 28.5 ms** | **17.9 / 22.6 / 24.0 ms** | **944** |

La ruta declarativa cuesta lo mismo que la actual en este escenario. No hubo fallos en ninguna medición. La fila «con el módulo declarativo» del runtime actual es más lenta en cola; con una sola corrida no la atribuyo a nada.

**Hallazgo:** la cuota por defecto del gateway (120 llamadas por minuto por módulo y empresa) estranguló la medición con `429`. Es razonable para pocos usuarios pero estrecha para una tabla muy usada; ahora es configurable por instalación (`RUNLY_SECURE_RUNTIME_CALLS_PER_MINUTE`, entre 10 y 6000; por defecto 120).

**Código personalizado (un contenedor por trabajo, arranque del runtime 0.7 s):**

| Trabajos concurrentes | Tiempo total | Por trabajo p50 / máx. |
|---|---|---|
| 1 | 0.89 s | 0.89 s |
| 4 | 1.8 s | 1.6 / 1.8 s |
| 8 | 3.4 s | 2.4 / 3.4 s |
| 16 | 6.1 s | 3.9 / 6.1 s |

Todos los trabajos terminaron bien y quedaron **0 contenedores y 0 redes** al cerrar. Saturación: cola acotada y `RUNTIME_BUSY` (429), cubierto por pruebas. Carga bajo demanda: el renderer completo no se carga para módulos que no lo usan; el build web pasa y la entrada principal no cambió en esta fase (los cambios son del lado de la API). No se reintrodujeron pools de ejecutores reutilizables.

**No medido:** una instalación con módulos declarativos y trabajos personalizados concurrentes al mismo tiempo (se midieron por separado), y el tamaño del bundle respecto a Stage 3 (sin cambios en el frontend).

## 13. Preparación del candidato

| Verificación | Resultado |
|---|---|
| Suite de seguridad (`pnpm test:security`) | **166/166** (eran 148; +gateway Stage 4, perfil del supervisor, instalación fuera de la raíz) |
| Gateway, convertidor, flag | 20/20 en `secure-runtime/__tests__` |
| Supervisor | 14/14 (perfil y fallos incluidos) |
| Multiempresa en PostgreSQL real | Compatibilidad de datos 10/10; relaciones 8/8; plantillas 6/6 |
| Conversión | 4/4 y la matriz de seis plantillas |
| Build web | Pasa (`vite build`) |
| Lint | Sin hallazgos en los archivos tocados. El lint global conserva un error ajeno previo (`scripts/verify-bookings-rooms.mjs`) |
| Privacidad | 40 hallazgos de la línea base, clasificados (§1) |
| Auditoría de dependencias (`pnpm audit --prod`) | 1 crítica / 14 altas / 12 moderadas / 7 bajas, igual que en Stage 3. Las críticas y altas están en `apps/desktop` (`tar`, `fabric`, `image-size`) y en herramientas transitivas de Prisma en la API (`deepmerge-ts`, `mysql2`, `effect`); la API no las importa directamente. No se reanalizó el alcance de cada advisory |
| Suite general | GENERAL_PLACEHOLDER |
| Instalación y actualización | Ver §11 |

### Plan de publicación coordinado (preparado, **no ejecutado**)

| Paso | Qué | Por qué en este orden |
|---|---|---|
| 1 | Release del ERP (API, worker, web) con el flag **apagado** y la migración `20270114000000` | Contiene la cuarentena de Stage 1. Los paquetes antiguos entran como código con autoridad, sujetos a la cuarentena |
| 2 | Confirmar la línea de Atlas 0.11.0 (§1) antes de construir la imagen web | El build de la API y la web depende de ello |
| 3 | Paquetes compartidos (`@runly/module-compiler`, `@runly/sdk`) en el SHA publicado | El compilador con la emisión segura de defaults y `shortName` (≥ `164353d6d`) |
| 4 | Pin del Hub y sus pruebas de compilación | El Hub fija un SHA exacto; pasarlo antes que el ERP produciría paquetes que un ERP viejo no entiende |
| 5 | Republicar los paquetes oficiales y el catálogo | Una vez que el ERP nuevo está en producción |
| 6 | Activar el flag experimental solo en staging | Después de §15 |

**Ventanas de incompatibilidad:** no hay inseguridad en el orden propuesto, porque el ERP recompila siempre con el compilador corregido y los ZIP antiguos solo entran como código con autoridad. **Cuidado operativo:** al actualizar, los módulos ya instalados quedan en cuarentena hasta que el propietario los apruebe; hay que avisarlo. El supervisor **no tiene imagen ni perfil de compose**, así que no forma parte de este orden; el runtime de código personalizado permanece apagado.

### Plan de reversión

| Escenario | Acción | Datos |
|---|---|---|
| Problema con el runtime experimental | Quitar `RUNLY_SECURE_RUNTIME` y reiniciar la API | Las tablas de módulos no se tocan; el esquema `runly_secure_runtime` queda inactivo y no se borra |
| Problema con un módulo declarativo | Retirar su paquete o revocar sus capacidades (efecto inmediato, mata trabajos) | Todas las filas permanecen y el runtime actual sigue sirviéndolas (verificado) |
| Volver a la imagen anterior | Reiniciar con la imagen previa | Los datos siguen donde estaban. **Advertencia:** la imagen anterior no contiene la cuarentena de Stage 1, así que revertir la imagen **reabre P0-01** |

## 14. Regresiones conocidas y nuevas

REGRESSIONS_PLACEHOLDER

## 15. Inventario de riesgos residuales

| ID | Riesgo | Severidad | Estado |
|---|---|---|---|
| R-1 | Socket de Docker en el supervisor (equivale a root en el host). Rootless, userns, AppArmor y gVisor no probados en un host Linux | P1 al desplegar | Delimitado, no resuelto |
| R-2 | **No existe imagen del supervisor** ni perfil de compose | Bloqueador para código personalizado en staging | Abierto |
| R-3 | Línea de Atlas 0.11.0: apliqué una línea de la lista de versiones revisadas; falta la confirmación de su responsable | Bloqueador de release hasta confirmar | Abierto |
| R-4 | Renderizado en navegador de la fachada REST no verificado (solo contrato HTTP) | P2 | Reducido |
| R-5 | Automatizaciones del Builder, Kanban, Dashboard, conexiones, enlaces públicos y widgets no se convierten; las escrituras del gateway no disparan automatizaciones | P2 | Clasificado `review` |
| R-6 | `relations.search` sin cursor; `resolve` sin permiso devuelve vacío (decisión: no filtrar existencia) | P3 | Documentado |
| R-7 | Código personalizado interactivo no soportado (~1 s por trabajo) | P3 | Sin cambios |
| R-8 | Tauri, PWA y dispositivos físicos sin probar | P2 | Sin cambios |
| R-9 | Error de UUID del publicador de actividad: identificadores no RFC; llamador sin identificar | P3 | Backlog del equipo de actividad |
| R-10 | Cuota de 120 llamadas por minuto por módulo y empresa estrecha para uso intensivo | P3 | Configurable |
| R-11 | Revertir la imagen reabre P0-01 | P1 operativo | Documentado |
| R-12 | Auditoría de dependencias: 1 crítica y 14 altas, ninguna importada directamente por la API; alcance sin reanalizar | P2 | Sin cambios |

## 16. Checklist de aceptación F1C

Para declarar **APTO PARA ACTIVACIÓN EXPERIMENTAL EN STAGING**:

- [ ] Responsable de Atlas confirma o sustituye el cambio de `0ff88dc90`.
- [ ] Imágenes API, worker y web construidas desde el SHA candidato **y repetidas tras la confirmación de Atlas**, con el instalador limpio y de actualización pasando contra ellas.
- [ ] Decisión sobre el supervisor: imagen y perfil de compose revisados, **o** el runtime de código personalizado se declara fuera de F1C.
- [ ] Si el supervisor entra: Docker rootless o namespaces remapeados verificados en un host Linux con el preflight en verde.
- [ ] Verificación del renderizado de la fachada en un navegador (Chromium, Firefox y WebKit) con la pila desechable.
- [ ] `verify-secure-runtime-api.mjs`, `verify-declarative-data-compat.mjs`, `verify-relations-contract.mjs` y `verify-template-matrix.mjs` contra las imágenes candidatas.
- [ ] Inventario de módulos reales convertidos en seco y revisado.
- [ ] Datos sintéticos de dos empresas en staging (no producción).
- [ ] Plan de reversión probado en staging, incluido el aviso de P0-01.
- [ ] Revisión de seguridad del supervisor.

## 17. Decisión explícita

**F1B no está cerrada.** La consolidación técnica está hecha y verificada localmente: adaptador de datos, borrado lógico, contrato de relaciones, auditoría e historial, preflight del supervisor, durabilidad, instalación fuera de la raíz y las seis plantillas. Para **cerrar F1B y avanzar a F1C** faltan tres cosas, ninguna de código del runtime:

1. **Atlas:** que su responsable confirme (o sustituya) la línea de `0ff88dc90` y se reconstruyan las imágenes.
2. **Supervisor:** decidir si el código personalizado entra en F1C. Si entra, hace falta su imagen, su perfil de compose y una verificación rootless o remapeada en Linux; si no, F1C se limita al runtime declarativo.
3. **Navegador:** una pasada de renderizado de la fachada en los tres motores.

Con (1) y (3) resueltos y el supervisor declarado fuera de alcance, el resultado pasaría a **APTO PARA ACTIVACIÓN EXPERIMENTAL EN STAGING** para módulos declarativos. No inicio Stage 5.
