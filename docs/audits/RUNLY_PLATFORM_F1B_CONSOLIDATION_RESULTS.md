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

Compresión en nginx: texto (CSS, JS, JSON, SVG, manifests) con `gzip_proxied any`. Esto alcanza también a las respuestas del proxy del sitio público (`/public/site/`, `/p/`, ...), algunas **autenticadas por cookie** (`services/external-identity`: cookie `rx_session`, `SameSite=Lax`; vista previa de Website). Ese es el caso donde BREACH es plausible (secreto en el cuerpo más texto controlado por el atacante, y el navegador adjunta la cookie solo). **Pendiente de decisión y no resuelto en este informe:** excluir de gzip esas rutas del proxy o limitar gzip a archivos estáticos. Hasta decidirlo, la configuración de nginx comprime más de lo que este análisis justifica.

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
- Decisión de compresión en las rutas del proxy público (§5).
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
