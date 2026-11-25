# F1B consolidation results (in progress)

Estado: **en curso, nada cerrado.** Este informe se actualiza al terminar cada intervención.
Última actualización: 2026-11-24. SHA de trabajo al redactar: ver `git log` (los commits se citan abajo).

## 1. Alcance

Consolidar el trabajo de seguridad de F1B (Stages 1-4) y el avance de F3.1: control del workspace, reconciliación de la suite general por nombre, retirada de configuración duplicada y verificación de que lo optimizado funciona en navegador. No se hizo push, PR ni despliegue. No se tocó el Secure Runtime.

## 2. Control del workspace (Etapa A)

| Elemento | Resultado |
|---|---|
| Estado al inicio | Único contenido sin versionar: informe y datos de F3.0. Sin cambios staged ni de otras sesiones |
| F3.0 versionado | `ca5dc5ba7`, tras revisar que no hay secretos ni datos personales (solo dominios de ejemplo y loopback) |
| Commits de esta continuación | `5688dda00`, `23cc4b900`, `4686fd2f8`, `de20647da`, `6e8a1b1bb`, `26b4c0c4e`, `cf29c3531`, `7273cdfb3` (cada uno una intervención) |
| Worktrees | Dos, fuera del repositorio y sin tocar el árbol principal: baseline `27c1913f8` y control F3.0 `119eac8e9`. Se eliminan al cerrar |
| Servidores del usuario | No se tocaron 4010 ni 5173. Se usaron 4021 (API aislada), 4173 y 4174 (servidores de laboratorio), todos propios |

### Atlas 0.11.0 (`0ff88dc90`)

**Sigue siendo bloqueador de release.** El commit solo añade `0.11.0` a la lista de versiones revisadas de `scripts/build-website-public-runtime.mjs`. No hay evidencia de revisión de contratos, runtime público, sanitización ni compatibilidad con plantillas por parte del responsable de Atlas. Lo único verificado hasta ahora es que el build de ERP con 0.11.0 pasa y que las pruebas de Atlas en HEAD pasan (ver §3). Eso no sustituye la revisión. No se evitó ningún control de versión.

## 3. Reconciliación de la suite general (B.1)

Mismo Node (22.23.3), pnpm (9.15.0), SO (Windows 11), `.env` y base de datos de pruebas; cada árbol con su propio `pnpm install --frozen-lockfile --offline --ignore-scripts` y `prisma generate`. Runner versionado: `docs/audits/perf-f3/scripts/run-suite.mjs` (lotes de 40 archivos, registra cada prueba por nombre). Lista de fallos por nombre: `docs/audits/evidence/f1c-suite-failures-{base,head}.txt`.

| | Baseline `27c1913f8` | HEAD (Stage 4 + F3.1) |
|---|---|---|
| Pruebas registradas | 7467 | 7499 |
| Fallos (por nombre, incluidos agregados de archivo) | 40 | 37 |
| **Fallos nuevos respecto del baseline** | | **0** |
| Fallos del baseline que ya no fallan | | 3 |

Resultado: **ninguna regresión nueva por nombre entre el baseline y HEAD.** Los 37 fallos de HEAD existen todos en el baseline.

Matices que no se ocultan:
- El número de Stage 4 (32 fallos) y el de Stage 3 (22) eran conteos por una metodología distinta y **no son comparables** con estos 37; este informe sustituye esas cifras.
- La comparación no incluye una tercera ejecución sobre `e73cdf3ad`. Los commits posteriores a él hasta `119eac8e9` son solo documentación, así que el código del candidato Stage 4 equivale al de `119eac8e9`; HEAD añade únicamente los cambios de F3.1 listados arriba.
- Tres pruebas fallaban en el baseline y pasan en HEAD (dos de Atlas y `storefront-sdk` react-exports). Probablemente dependen de la versión de Atlas que resuelve cada lockfile; no se investigó la causa.
- La clasificación siguiente es **por nombre y área, no por análisis de causa raíz de cada prueba.**

### Clasificación de los 37 fallos (todos preexistentes)

| Clase | Pruebas | Nota |
|---|---|---|
| Entorno (instaladores `.sh`/`.ps1` y bootstrap en Windows) | bootstrap entrypoints, external/local sh y ps1, upgrades de noviembre, scripts heredados, snapshot del devkit, fuentes compartidas de Docker | Dependen de shell/POSIX; `docker-shared-sources` y `installer-devkit-snapshot` ya se confirmaron fallando en `27c1913f8` |
| Infraestructura (PostgreSQL) | cinco archivos `website-*-postgres` | Necesitan base de datos de Website |
| Navegador | Tiptap/ProseMirror clipboard en Chrome | Entorno de navegador |
| Artefactos generados desactualizados | catálogo de ayuda, `capabilities.json`, identidad PWA de módulos, catálogo runtime de módulos, claves oficiales, `generateManifest`, `runly.growth` | Algunos dicen explícitamente «run scripts/generate-...»; probable deriva de generados |
| Funcionales por revisar | `call-transcript-analysis-service.analyzeTranscript`, `contactsProposalModule.isAvailable`, `files visibility`, sensibilidad por adaptador, ancho máximo de tabla | Sin tocar áreas de este programa; requieren triage |
| Marketplace/Hub | consumer de artefactos, Marketplace integrado | Dependen del Hub |

**Backlog:** los preexistentes quedan registrados sin cambiar pruebas ni assertions. Ninguno afecta a seguridad ni al Secure Runtime según el nombre; la afirmación completa requiere el triage individual.

## 4. Configuración duplicada de nginx

`infra/installer/nginx/spa.conf` se retiró en `de20647da`. Evidencia de que no tenía consumidor: no aparecía en `release-files.json`, ni en el compose del instalador, ni en un Dockerfile (solo `infra/docker/web.Dockerfile` copia `infra/nginx/spa.conf`). Sus únicos referentes eran una prueba (`scripts/test-website-origin-installer.mjs`, ahora cubre solo el archivo real: 11 aserciones HTTP + 3 de navegador pasan) y documentación histórica, que se deja como historia salvo el runbook, que se actualizó.

## 5. Nginx del web: compresión y caché (verificado con nginx real sobre el dist construido)

| Recurso | Política | Motivo |
|---|---|---|
| `/app/assets/*` (764 archivos, todos con hash de contenido) | `public, max-age=31536000, immutable`, gzip | El nombre cambia cuando cambia el contenido |
| `/app/index.html`, fallback SPA | `no-store` (sin cambios) | Debe ver siempre el último despliegue |
| `/app/shims/*`, `/app/bootstrap.css` y resto de `/app/` | `no-cache` (revalida con ETag) | **Corrección:** `/app/shims/` no coincidía con la regla `/shims/` y quedaba con caché heurística |
| `/runly/*`, `/module-logos/*` | `public, max-age=3600` | Sin hash; una hora y revalida, para que un cambio de marca aparezca sin limpiar caché |
| `sw-*.js`, `pwa-bootstrap.js`, `runtime-config.js`, manifests | Sin cambios (`no-store` / reglas previas) | Fuera del alcance de lo versionado por hash |

Compresión en nginx: solo archivos estáticos del ERP (CSS, JS, JSON, SVG, manifests; mínimo 1 KB). **Todas las rutas con `proxy_pass` llevan `gzip off`** (commit `61b6658b4`): el proxy del sitio público sirve JSON autenticado por cookie (`services/external-identity`, cookie `rx_session`, `SameSite=Lax`), el caso donde BREACH es plausible (secreto más texto controlado por el atacante en un mismo cuerpo, con la cookie adjuntada por el navegador). Verificado con nginx real: el chunk de entrada sale en gzip; las rutas proxy no se comprimen. Costo: el HTML del sitio público sigue sin comprimir, como antes.

### Compresión de la API (`7273cdfb3`)

El nginx del web **no** está en la ruta de las llamadas del ERP a la API (el cliente usa `RUNLY_API_URL`), así que la compresión de nginx no ayuda a `/blueprints`. Se añadió, solo para `/blueprints` y `/runtime/modules`, gzip y ETag débil con `Cache-Control: private, no-cache` y `Vary: Authorization, X-Runly-Company-Id`. Criterios de clasificación:

| Criterio | `/blueprints`, `/runtime/modules` |
|---|---|
| Información sensible en el cuerpo | Sin tokens ni URLs firmadas; metadatos de módulos filtrados por permiso |
| Texto controlado por el atacante reflejado | No |
| Autenticación | Bearer en cabecera: un sitio atacante no puede hacer que el navegador la adjunte |
| Observabilidad de tamaños | Posible en red, pero sin secreto que inferir |
| Permisos tras revocación | `no-cache` revalida cada vez; el 304 solo ocurre si el cuerpo de **ese** usuario y empresa es idéntico (prueba incluida) |

La autenticación por Bearer reduce el riesgo, no lo elimina por sí sola; por eso la lista es cerrada y documentada en el código. No se comprime el resto de la API.

## 6. Verificación en navegador de las optimizaciones (Playwright, Chromium)

`docs/audits/perf-f3/scripts/visual.mjs`, contra el dist de HEAD servido con la política de nginx:

- Cuatro contextos: escritorio claro (1x), escritorio oscuro (2x), móvil claro y móvil oscuro (3x, `isMobile`).
- Arranque, loader (con `/instance/status` retenido para que se muestre) y login revisados visualmente. La animación con máscara del logotipo funciona con la imagen externa; en móvil 3x el isotipo se ve nítido (variante de 432 px).
- Las variantes `-sm` y `-md` están en el dist y se solicitan en navegación (4-23 KB). Los HTML del loader pesan 3 KB transferidos.
- Sin errores de página ni solicitudes fallidas. CLS de la carga: 0.002-0.005.

**No verificado:** Firefox y WebKit, dispositivos físicos, PWA instalada, Tauri y hosts nativos. La transición loader a shell autenticado se midió en F3.1 (resultados en su propio informe), no se inspeccionó visualmente con sesión.

## 7. Solicitudes redundantes (`6e8a1b1bb`)

- `/instance/status`: AppEntry, el guard de rutas, el login y la entrada pública lo pedían cada uno por su cuenta con claves distintas. Ahora comparten `instanceStatusQuery` (clave `instance-status`, `staleTime` 30 s que ya existía). `CompanyBranding` y el asistente de configuración ya invalidan esa clave.
- `/user/me`: `hydrateSession` y `onAuthStateChange` lo pedían a la vez en la carga. Se comparte la petición **en vuelo** (clave: token + empresa); no se cachea nada. El refresco explícito tras cambios de perfil conserva su petición propia.
- `/notifications/summary`: **no se encontró una causa estática** (la query tiene una sola clave y el montaje doble se deduplica); la causa debe verse en la medición con trazas. Pendiente.

## 8. Pendiente de esta etapa

- Imágenes API, worker y web construidas desde un mismo SHA con arranque, health, migraciones, actualización y reinicio verificados (el worker de 2.57 GB y la web de 284 MB sin análisis de capas).
- Navegador real (Chromium, Firefox, WebKit) para la fachada declarativa y las seis plantillas.
- Decisión sobre el supervisor: permanece experimental y deshabilitado; sin imagen ni perfil de compose. Ver decisión en §9.
- Rollback seguro: revisión mínima segura y mecanismo de recuperación.
- Triage individual de los 37 fallos preexistentes.

## 9. Decisiones (independientes, provisionales)

| Ámbito | Estado | Condición |
|---|---|---|
| Contención de seguridad | APTO LOCALMENTE PARA STAGING | Sin cambios: suite de seguridad 166/166 en Stage 4; no se ha repetido sobre imágenes |
| Runtime declarativo | NO APTO para activación experimental | Falta prueba en navegador real y en imágenes candidatas |
| Runtime de código personalizado | NO APTO | Sin imagen ni perfil de compose del supervisor; sin verificación en Linux real |
| Candidato de release | NO APTO | Atlas 0.11.0 sin confirmar; imágenes sin verificar desde el mismo SHA |
| Activación en staging | NO APTO | Depende de las filas anteriores |

No se declara P0 cerrado en producción. Revertir a una versión anterior a la cuarentena reabre P0-01.

## Anexo: triage de los 37 fallos preexistentes (2026-11-25)

Suite completa, una ejecución (`node scripts/ci/full-suite-baseline.mjs`, 576 s): **6932 pruebas, 6897 aprobadas, 18 fallidas, 17 omitidas**. De los 37 nombres fallidos del baseline quedan **7** (5 archivos de Postgres de Website, 1 prueba de navegador y 1 catálogo generado). Ninguna aserción se redujo ni se desactivó; cada cambio indica el contrato correcto.

| Familia | Causa raíz | Clase | Resolución |
|---|---|---|---|
| `contactsProposalModule.isAvailable`, `analyzeTranscript` | La habilitación por empresa pasó a listar los módulos instalados (`runlyModule.findMany`; los módulos personalizados son opt-in por empresa, `4ee290770`) y la fixture no lo simulaba | Fixture obsoleta | Fixture con `findMany` |
| `files visibility` (cobertura de tipos) | **`TicketEvent` se aceptaba como entidad de archivos sin regla de acceso** (deny por defecto: solo quien lo subió) | **Defecto real** | Regla `permission("ticketing.events.manage")` |
| Ancho máximo de la tabla | `TREE_MAX` pasó de 420 a 560 a propósito (explorador unificado) | Prueba obsoleta | Valores del límite |
| Sensibilidad por adaptador | Website marca `publication.rollback/unpublish` como sensibles (correcto: cambian lo público) | Prueba obsoleta | Contrato ampliado a `website.publication.*` |
| Capacidades de ayuda, catálogo de identidad, icono PWA de Website, navegación de Growth, scaffold | Artefactos generados o catálogos sin actualizar al añadir `runly.ticketing`, `runly.bookings`, `PanelsTopLeft`, «Monitores» | Deriva de generados | Entrada `runly.ticketing` en `capabilities.json`; claves current-only; icono permitido; expectativas |
| Registro de módulos Runly | Misma causa que identidad | Deriva | Resuelto por lo anterior |
| Snapshot del devkit, fuentes compartidas de Docker, entrypoints/upgrades del instalador (11 pruebas) | Snapshot desactualizado frente al exportador; `build-push` ejecuta ahora la comprobación del release del instalador, que la fixture no tiene; los bootstraps son cargadores generados y la dependencia se declara en `release-files.json` | Deriva + fixture + prueba obsoleta | Snapshot regenerado, fixture con sustituto neutro, prueba contra el manifest del release. **No eran del entorno** |
| Consumidor de artefactos compartidos (2) | `tar` GNU de Git Bash lee `C:\...` como host remoto (también en el verificador real); la fixture asumía que `preview-runtime` era el último paquete | Portabilidad + fixture | Ruta relativa en verificador y prueba; búsqueda por nombre |
| Portapapeles TipTap/ProseMirror (seguridad) | El bundle de la prueba arrastraba `import.meta.glob` (solo Vite) y el proveedor simulado no tenía `setComposing` | Infraestructura de prueba + fixture | Definición vacía de `glob` en esbuild; proveedor con el contrato real. **Pasa en Chrome real** |
| Marketplace integrado (navegador) | El diálogo de importación de Studio se rediseñó (ya no hay «Desde Marketplace» ni «Revisar») | Prueba obsoleta | **Pendiente**: reescribir contra el flujo nuevo (equipo de Studio) |
| Catálogo de runtime de módulos | React 19.3.0 instalado frente a 19.3.1 en el catálogo; depende de los cambios de dependencias de otra sesión sin confirmar | Concurrencia | **Pendiente** tras fijar dependencias: `node scripts/generate-module-runtime-catalog.mjs` |
| 5 archivos `website-*-postgres` | Exigen un contenedor Docker desechable etiquetado; lanzan error sin él (guarda de seguridad) | Infraestructura opt-in | Sin cambios; ejecutar con `RUNLY_WEBSITE_TEST_DATABASE_URL` y `RUNLY_WEBSITE_TEST_DISPOSABLE` |

Regresión propia detectada y corregida por esta suite: `callSounds.test.js` esperaba la descarga de audios al desbloquear (comportamiento anterior a F3.2); ahora sigue el flujo «el shell autenticado activa, el gesto desbloquea».

## Anexo: controles de calidad incorporados (2026-11-25)

- `node scripts/ci/run-gates.mjs fast` (43 s, sin build, base de datos ni navegador): ESLint de errores, privacidad (0 hallazgos; las 40 de proxies de confianza se resolvieron con IP de ejemplo y constantes RFC 1918 permitidas por archivo y valor), alcance por empresa (14 `fetch` directos revisados y justificados), política de dependencias, UUID, propiedad del esquema de Supabase, guardas de rendimiento y 21 pruebas de contrato.
- `run-gates.mjs release` (66 s): lo anterior más build web, presupuestos del bundle y suites de seguridad (166/166); con `RUNLY_CONTRACT_API` añade el contrato HTTP de payloads y autorización; con `--full-suite` compara la suite completa con `docs/audits/evidence/suite-failures-baseline.txt` (una falla nueva rompe el gate; las corregidas se reportan).
- `.github/workflows/quality-gates.yml`: `fast` en cada PR y push a main; `release` en etiquetas `v*` o manual. YAML validado; **no se ha ejecutado en GitHub** (sin push).
- Guardas de regresión de rendimiento (`scripts/ci/perf-guards.mjs`, con prueba de mutación): imágenes del login (≤ 8 KB las pequeñas, ≤ 32 KB las medianas), loaders HTML ≤ 16 KB sin base64 duplicado, `index.html` ≤ 8 KB, sin imágenes de tamaño completo en pantallas de arranque, sin esperas artificiales de arranque, sonidos no descargados antes de autenticarse, sin librerías pesadas (motion, TipTap/ProseMirror, Excalidraw, MapLibre, hls.js, LiveKit) importadas estáticamente en el login ni en su cierre de JS compilado, que se limita a 580 KB gzip (medido: 525). Son presupuestos de regresión, no los objetivos de optimización.
- Seguridad: el runtime experimental sigue apagado por defecto (solo `RUNLY_SECURE_RUNTIME=experimental` lo activa) y el cliente del supervisor devuelve `null` sin URL y secreto de 32 caracteres; una prueba nueva demuestra que el estado de cuarentena no depende de la bandera. P0 **no** se declara cerrado en producción.
