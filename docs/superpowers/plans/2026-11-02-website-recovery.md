# Website Recovery — plan de implementación preparado en Fase 1

Fecha: 2026-11-02. Código auditado `5a716b43ac940a62172b96b67a369940e10fb26a`; expediente Fase 0 y base Fase 1 `2d4efd6a9c5aebafe96124bf4ddb821810d061aa`, main, limpio al comenzar.

**Fase 1 terminada para revisión; implementación y Fase 2 no iniciadas.** Este documento organiza trabajo futuro, no lo autoriza. Fuente de objetivo: [Contratos v1](../specs/2026-11-02-website-recovery-contracts-v1.md). Fuentes de hechos: [Expediente maestro](../specs/2026-11-02-website-recovery-master.md) y evidence/2026-11-02-website-recovery. Las recomendaciones preliminares quedan sustituidas por W1–W10 y esta secuencia.

## 1. Entrega y verificación de Fase 1

Se prepararon arquitectura, modelos/constraints propuestos, contratos administrativos/públicos/legacy, permisos, estados/errores, límites ZIP, versión candidata y estrategia de migración/reversión. No se editó código de aplicación ni tests existentes, ni se actualizaron package.json/lock. No hay UI nueva, agentes delegados, servicios iniciados, .env cargados, DB/Storage real o cambios de Commerce.

Investigaciones ejecutadas:

| Investigación | Resultado | Qué queda pendiente |
|---|---|---|
| npm tarball 0.2.4 (integridad registry verificada) | 10/10; API 79 exports, dependencias iguales, CJS/ESM por esbuild, CSS presente, React 19.3.1, 18 bloques y 27 páginas de 6 plantillas Runly | Browser/edición/hidratación/CSS/DOM sanitizer, corpus histórico y lock nuevo; no es adopción productiva. |
| WR-17 fixture original | Falla original reproducida; mismas aserciones pasan con solo fixture corregido en memoria | Cambio al test original diferido a implementación; suite no se declara 77/77 real. |
| Resolver negativos y Growth | 6/6 conjunto dirigido, incluyendo owner Growth con propertyId en siteId histórico | Persistencia/RLS/integración real y backfill FormScope no ejecutados. |

La suite de Fase 0 registró 23 probes observacionales, 76/77 ERP, 8/8 tenant Catálogo y 114/114 del checkout externo. No se repitió toda esa auditoría ni se confundieron sus resultados con nueva evidencia. La suite externa prueba fuente 424de9f, la investigación nueva sí prueba el tarball publicado 598795c.

Reproducción local, usando npm solo para recuperar el artefacto público, sin instalar dependencias ni ejecutar scripts del paquete:

```powershell
New-Item -ItemType Directory -Force docs/private/website-recovery-phase1
npm pack @raulbellosom/atlas-web-builder@0.2.4 --ignore-scripts --pack-destination docs/private/website-recovery-phase1 --json
$env:RUNLY_WEBSITE_BUILDER_TGZ = Join-Path (Get-Location) 'docs/private/website-recovery-phase1/raulbellosom-atlas-web-builder-0.2.4.tgz'
node --test --test-reporter=spec docs/superpowers/evidence/2026-11-02-website-recovery/phase1-builder-candidate.mjs docs/superpowers/evidence/2026-11-02-website-recovery/phase1-resolver-research.mjs
```

Scripts no bootstrap de API/dotenv; DB/Storage son dobles, fetch está bloqueado. Esbuild transforma en memoria los bloques/plantillas actuales, sin escribir bundle ni ejecutar build scripts. El hijo que ejecuta el test original limpia NODE_TEST_CONTEXT para no heredar el protocolo binario interno de node:test. El checksum del tarball esperado está fijado en el script. No se versiona el tarball.

## 2. Secuencia exacta después de aprobar contratos

Una recuperación funcional con pasos verificables y, después, diseño/frontend definitivo. No volver a redefinir identidad/release/ownership en cada pantalla.

| Paso | Dependencia | Trabajo / responsable | Evidencia de cierre |
|---|---|---|---|
| S1 Autoridad y baseline | Aprobación W1/W2/W9 y alcance funcional | Codex: DTO allowlists, pertenencia de todos los padres, política de comando API/MCP, transiciones publish; actualizar fixture WR-17 y negativos reales | Pruebas de dos empresas/roles y servicio directo; update sin publish no publica; mass assignment rechazado; suite seleccionada 77/77 real sin borrar asserts. |
| S2 Identidades y borradores | S1 | Codex: mapa Forms Website/Growth, clasificación de históricos, defaults multisitio, documento normalizado/CAS, theme y adaptador blog | IDs distintos pasan Website y Growth externo; no se toca submission; preview/draft/tema/rutas coherentes; no side effects de GET; casos ambiguos reportados. |
| S3 Release y gateway | S2 + decisiones origen/hosts | Codex: tablas/constraints aditivas, staging privado, manifiesto/runtime sellado, puntero/recibos/outbox, adapter legacy, gateway estricto, shadow/bootstrap y rollback | Fallos inyectados antes/durante/después de commit, dos activadores, retry tras timeout, no mezcla ni tenant fallback, retiro público verificable; rollback no toca drafts. |
| S4 Imports y candidato | S3 | Codex: lector streaming/política ZIP, PublicAssetBinding, preview aislado local y matriz de formatos; validar lock/browser de 0.2.4 o tarball nuevo autorizado | ZIP adversarial rechazado, assets pinneados, main.js con bytes distintos bloqueado, SSR no ejecutado, tokens ERP inaccesibles; builds auténticos/frameworks según matriz explícita. |
| S5 Diseño definitivo | Backend S1–S4 y contratos v1 disponibles, autorización de Claude | Claude: capturas UX actual, diseño final setup/admin/editor/forms/publish/domain por estados/errores/capabilities; sin UI provisional | Flujos y especificación responsive/a11y revisados; sin endpoint/estado inventado; funcionalidades diferidas con capability false. |
| S6 Frontend e integración | S5 + contratos de backend estables | Claude React/UX; Codex adapters/SDK/runtime backend | Crear/editar/guardar/preview/publicar/rollback/unpublish completos; manejar conflicto sin pérdida; tenant/query cache aislado; sin IDs manuales donde exista selector autorizado. |
| S7 Consolidación local | S6 | Codex pruebas de seguridad/DB/upgrades/external; Claude responsive/a11y | Matriz A01–A28 y F1 abajo, corpus histórico, piloto/rollback documentados, veredicto formal; sin push/deploy/publicación npm automática. |

S3/S4 se prueban en laboratorio local: DNS/TLS de plataforma, registro global, custom domains y despliegues son decisiones operativas posteriores, sin bloquear los contratos configurables. Una capability permanece false si su infraestructura aún no existe. El orden evita diseñar una pantalla de publicación sobre un backend que todavía no garantiza publicación.

## 3. Causa raíz, archivos y regresiones por hallazgo

Prefijos: API=`apps/api/src`; UI=`apps/desktop/src`; todos los paths siguientes son del repo salvo el paquete externo explícito. Cambios son **propuestos**. Ningún hallazgo queda «corregido» por pasar un probe observacional.

| ID / prioridad | Causa raíz y archivos afectados | Corrección / test de cierre | Paso |
|---|---|---|---|
| WR-01 P1 | API/routes/public-website.js; services/dist-serve-service.js ignoran status/puntero único | Gateway aplica lifecycle/publication a todas las rutas/assets/forms ligados; draft/maintenance/unpublish no emiten contenido por URLs alternativas | S3 |
| WR-02 P1; riesgo externo P0 | API/services/dist-serve-service.js; infra/nginx/spa.conf e infra/installer/nginx/spa.conf confían header y fallback global | Host exacto + proxy confiable, mappings legacy explícitos; desconocido/spoof/múltiples header no eligen primaria | S1/S3 |
| WR-03 P1 | UI/modules/runly.website/screens/WebsitePageEditorScreen.jsx; API/routes/website/pages-routes.js y website-service.js no comparten input/revisión publish | Save/CAS + prepare/activate; legacy body no se ignora; editar tras preparar da 409, reintento no publica dos veces | S2/S3/S6 |
| WR-04 P0 | API/routes/website/validators.js y pages-routes.js admiten estado público por update | Transición pasa publisher con pages.publish también en servicio; editor sin publish no reactiva página previa | S1 |
| WR-05 P0 (límite de servicio) | API/routes/website/website-service.js, themes/menus/blog/pages-routes.js; services/forms-service.js aceptan referencias sin parent scope | Contexto validado + FK/checks compuestos; páginas/forms/theme/menu/parent/reorder ajenos devuelven 404, ninguna escritura parcial | S1/S2 |
| WR-06 P1 | API/services/dist-upload-service.js y dist-serve-service.js namespace/cache por empresa | company/site/release privado + PublicAssetBinding por sitio; A1/A2 same tenant no comparten bytes/historial/preview | S3/S4 |
| WR-07 P1 | API/services/dist-upload-service.js expone upserts antes de UPDATE metadata | Manifiesto ready completo antes de CAS; error de cada upload deja release público idéntico, incluidos hashes | S3/S4 |
| WR-08 P1 | API/services/dist-upload-service.js slice sin pertenencia al wrapper | Lector streaming con nombre original, root inequívoco; outside.txt nunca truncado/subido | S4 |
| WR-09 P1; riesgos P0 | API/services/dist-upload-service.js, routes/website/dist-routes.js y boot Storage en index.js solo limitan comprimido | Limitar streaming/ratio/cantidad/MIME/privados; bucket nuevo privado, ningún server/npm ejecutado; symlink/CRC/zip bomb acotada/traversal rechazos | S3/S4 |
| WR-10 P2 | API/services/dist-upload-service.js construye SUPABASE_URL interno en historial | Descargar original por endpoint autenticado/temporal autorizado; URLs navegador usan resolver público donde aplique; dominio interno nunca en DTO | S3 |
| WR-11 P2 | API/routes/website/validators.js, pages-routes.js y UI editor string vs record | v1 document objeto validado; aliases leen string/objeto una vez; probar invalid/futuro/orphan sin pérdida silenciosa | S2 |
| WR-12 P1 | UI/modules/runly.website/screens/WebsiteWizard.jsx; API/routes/website/website-service.js upsert/getActiveTheme y routes/public-website.js tema no asociado | Setup atómico y theme por sitio; mismo tema en preview/release, editar tema no cambia versión pública previa | S2/S3 |
| WR-13 P1 | API/routes/website/blog-routes.js, website-service.js, public-website.js; UI/website/runlyBlocks/blogIndexBlock.jsx fuentes distintas | Adaptador sourceKind en manifiesto; listado y ficha desde release, IDs/rutas viejos preservados y colisiones bloqueadas | S2/S3/S6 |
| WR-14 riesgo P0 | Nginx; API/services/dist-serve-service.js badge/config; UI/shell/PublicWebsiteEntry.jsx raíz ERP/public compartida | Runtime/preview públicos aislados, sin auth ERP ni /app; navegador intenta acceso a storage/credenciales/admin y falla; no declarar incidente real previo | S3/S4 |
| WR-15 P0 (límite persistencia) | API/routes/website/blog-routes.js PATCH raw; website-service.js update data completo | Allowlist estricta y pertenencia inmutable; payload companyId/siteId rechazado sin llegar a update, servicio directo también | S1 |
| WR-16 P1 | API/services/storefront-capture-service.js; routes/growth/growth-property-service.js, growth-form-routes.js; services/forms-service.js e IIFE public/runly-sdk.js | FormScope tipado y analytics ID separado; Website distinto de Property y Growth externo funcionan, ambiguous 409, GET sin upsert; no renumerar respuestas | S2 |
| WR-17 P2 | API/routes/__tests__/public-website-capture-config.test.js stub company incompleto | Corregir findUnique/empresa habilitada en fixture, conservar asserts y añadir negativos/error DB; verificar 77/77 seleccionado | S1 |

Fuente de nombres exactos de archivos/lineas observadas y severidad en §8 del maestro. Tabla usa abreviaturas de prefijos solo para legibilidad; no crea rutas bajo API/UI.

## 4. Ownership por rutas para implementación

| Owner | Archivos actuales / nuevos propuestos | Límite |
|---|---|---|
| Codex | apps/api/src/routes/website/*.js, routes/public-website.js; services/dist-upload-service.js, dist-serve-service.js, forms-service.js, storefront-capture-service.js; rutas Growth de mapeo/Forms | No cambiar contratos Commerce, ni otros módulos por conveniencia. |
| Codex | Nuevos services/website-authorization-service.js, website-release-service.js, website-import-service.js, website-form-scope-service.js, website-domain-service.js, website-preview-service.js y routes/website/v1/*.js (propuestos) | Servicios finitos que reutilizan lo existente; no un segundo CMS. Revisar nombres al implementar sin cambiar DTO aprobado. |
| Codex | Persistencia oficial aditiva, pruebas DB/migración, instalador/Nginx/gateway; apps/api/src/index.js únicamente wiring/boot condicionado | No arrancar boot contra datos compartidos ni generar migraciones fuera de fase autorizada. No usar modificación core para un custom module. |
| Codex | packages/sdk/src/domains/website.js, API/public/runly-sdk.js, MCP/adapters/website.js, helpers de headers, contratos/fixtures API | Mantener aliases y versionar capability/DTO; no editar SDK/checkout Commerce. |
| Codex | Apps/desktop integración técnica de runtime público versionado: nuevo apps/desktop/src/website/public-release-entry.jsx, empaquetado y contrato de host (propuestos); registry/runtime props compartidos | Reutilizar renderer/bloques; Claude revisa impacto visual, no edita a la vez el runtime glue. |
| Claude | apps/desktop/src/modules/runly.website/screens/**, components/**; apps/desktop/src/website/WebsitePageRenderer.jsx, EditorContextBar.jsx, runlyBlocks/**, runlyTemplates/**, runlySite.css; shell/PublicWebsiteEntry.jsx al separar edición del host público | Solo tras autorización de diseño/React. Usa @runly/ui, estados/capabilities reales y contratos aprobados. |
| Owner del paquete externo | atlas-web-builder src/**, package.json, build/test/registry | Codex prepara validación técnica; cambios visuales se coordinan con Claude por archivo. Ningún publish implícito. |
| Codex documental | Maestro, contratos v1, este plan y evidencia técnica | Handoff de Claude en documento separado, sin editar rectores simultáneamente. |

Si una corrección implica una ruta compartida se registra owner/revisor antes del cambio; un autor por archivo durante el paso. La tabla no significa autorización de edición de esos archivos en Fase 1.

## 5. Migración y reversión, sin pérdida histórica

1. Laboratorio explícito: DB/bucket/config propios con dos empresas, dos sitios de una empresa y WebsiteSite.id distinto de GrowthProperty.id; jamás reutilizar .env.external. Verificar destinos sin publicar valores. Backup/restore ensayado antes de backfill.
2. Inventario read-only de filas/owners/hosts/URLs/artefactos y anomalías; conservar IDs y dump privado de comparación. No asumir status draft=privado por WR-01 ni que todo siteId corresponde Website.
3. Estructuras aditivas y flags de reader por sitio, desactivados. Generación UUIDv7 en DB; índices de FKs y constraints compuestas probadas con datos sintéticos. RLS/no grants anon de tablas privadas; no confiar en RLS para una conexión privilegiada.
4. Backfill idempotente por lotes/ledger: default explícito, FormScope/espejos sin GET mutante, dominio legacy mapping, release bootstrap de contenido público conocido. Ambiguos a revisión; no OR entre tenants ni eliminación de registros.
5. Copia verificada de objetos a nuevo bucket privado; conservar originales/URLs existentes, sin moverlos ni cambiar todo bucket público. Runtime/hash/manifiesto y bindings de assets. Reportar legacy-reference donde todavía no se puede fijar medio externo.
6. Shadow compare y cutover de un sitio a la vez mediante CAS con journal/recibo. Gate si hay rutas faltantes, owner no resuelto, hostname sin asignación o runtime no disponible.
7. Rollback de publicación mueve puntero; rollback de rollout vuelve solo a reader legacy seguro/snapshot conocido. No reactivar permisos vulnerables/uploader upsert/fallback global. Conservar nuevos datos y mappings para reintento; ninguna down migration destructiva.

Eliminar originales públicos, purgar respuestas, migrar identidades atlas.*, solicitar DNS/TLS o publicar nueva versión npm son operaciones separadas. Unpublish del nuevo gateway no revoca archivos originales aún públicos ni copias descargadas: inventario y retiro de esas URLs requiere decisión explícita.

## 6. Plan de pruebas y aceptación cerrable

| Grupo | Caso mínimo y cierre esperado |
|---|---|
| F1-A Tenant/roles | API y servicio directo, company A/B, editor/publicador, referencias de todos los tipos y lotes mixtos; 401/403/404 correctos, cero escritura ajena; no mass assignment. |
| F1-B Snapshot/CAS | Guardar A, preparar, guardar B: activar A da 409 draft_changed; dos activaciones misma base solo una gana; documento/tema/menu anterior no cambia al editar draft; rollback preserva B. |
| F1-C Fallos/retries | Error al subir n-ésimo objeto, al sellar, antes del commit y conexión perdida tras commit; puntero viejo intacto o nuevo completo, nunca parcial; misma clave un efecto, body distinto 409. |
| F1-D Serving/cache | Site A1/A2 y B, Host unknown/forwarded/multi headers; cold/warm/múltiples réplicas; unpublish/maintenance retira HTML/JSON/assets en nuevas peticiones; DB caída no sirve stale. |
| F1-E ZIP | 100/400/50 MiB fronteras, 10k archivos, 200:1, wrappers, duplicados, corrupt/CRC/symlink/traversal codificado, privados/server/source; fixture acotado, sin agotar host. Renombrar assets cambiados, conflicto estable 422; archivos de otra versión no sustituidos. |
| F1-F Frameworks | HTML, React/Vite, Vue, Angular browser, Astro static, Next export auténticos; MPA/SPA, assets/chunks/rutas profundas/base, navegación y missing assets 404. SSR/source rechazados sin ejecutar npm/Node. Registrar matriz individual, no dar por soportado por logo. |
| F1-G Origen/preview | Browser real con ERP autenticado y script sintético que intenta leer sesión/admin del otro origen; preview expira/revoca/one-time, no leads ni notificaciones; no login ERP bajo host público, postMessage limitado. |
| F1-H Forms/Growth | Website≠Property, Growth external y linked; ids legacy ambiguos; campos/mismatch schema/retry/antispam/Turnstile; transacción lead/submission, SMTP falla sin pérdida, lectura/export autorizadas; no borrar históricos. |
| F1-I Catálogo | Matriz published/posEnabled 2×2, lista/direct slug/id/categorías/variantes/empresa deshabilitada, agotados y refresco pestaña 30 s/foco. No cambiar POS ni hornear productos privados. |
| F1-J Compatibilidad | SDK/MCP/IIFE aliases y REST antiguos, corpus schema1 string/objeto, theme/blog/URLs, default site; upgrade/read flags/backfill/restore y local/external propios. Runtime por release no cambia al actualizar builder. |
| F1-K Frontend | 390/1440, claro/oscuro, teclado/foco, guardado pendiente/conflictos/job/errors; setup sin tienda, multisite, forms/selectores, versión/rollback/domains readiness sin capacidades inventadas. |

Estos grupos concretan A01–A28 del expediente. Cierre funcional exige pruebas de integración reales en laboratorio además de unidades; no basta cambiar probes para que sigan verdes. Presentar número/resultado/limitación por grupo, SHA de código y evidencia sanitizada. Pendientes bloqueantes deben conservar resultado NO APTO, no esconderse como «manual pendiente» de una función supuestamente validada.

## 7. Decisiones pendientes, riesgos y transferencia a Claude

Antes de S1: aprobar W1–W10/contratos; política de origen/namespace para ZIP; grants de permisos; límites/retención y tratamiento de referencias históricas. Para subdominios de plataforma se necesita registro autoritativo global/instalaciones y readiness TLS, aún no operativos por este trabajo. Custom domains diferidos, sin prometer que guardar domain configura DNS.

Versionado candidato: 0.2.4 probado como tarball en laboratorio; adopción exacta pendiente de QA browser/histórico y lock controlado. Los fixes hero posteriores exigen nueva versión/publicación separada. Las 27 páginas son plantillas actuales, **no datos históricos de clientes**. No recomendar actualización productiva automática.

Riesgos residuales: coste/memoria/timeout del parser bajo carga, lock/constraint/RLS real, drift de referencias legacy, originales públicos fuera del nuevo gateway, datos ya descargados, propagación global de hostnames, cookies/same-site y dependencias de auth/checkout de Commerce. No se decide un cambio a Commerce dentro de este alcance; si fuera necesario se entrega incompatibilidad reproducible para autorización aparte.

Claude recibirá contratos v1 y endpoints realmente disponibles con capabilities, ejemplos de errores/409, estado backend por cada operación y versiones del runtime. Diseñará setup, navegación/admin multisitio, editor/páginas, formularios/respuestas, selector de Catálogo, publicaciones/versiones/rollback, domains/settings y UX de imports. Debe capturar pantallas antes de emitir auditoría visual, usar @runly/ui y no editar backend/DTO ni construir pantallas provisionales. **No se le asignó trabajo ni se inició Fase 2.**

## 8. Acta de cierre documental

Maestro y este plan actualizados; contratos v1 y dos scripts nuevos. 16/16 investigaciones correctas; ningún archivo funcional o dependencia modificado. Causa de WR-17 y compatibilidad Growth documentadas con evidencia adicional. Veredicto de Website permanece NO APTO E2E; **Fase 1 documental terminada para revisión**. El siguiente paso es la revisión del responsable, no la ejecución automática de S1. Sin SSH/push/deploy/DNS/TLS/migraciones ni alteración de datos.

Calidad: sintaxis de los scripts y whitespace correctos. Privacidad global: 6565 archivos, 67 alertas preexistentes; privacidad individual de los cinco entregables: cero hallazgos. Tarball ignorado y fuente externa sin cambios. Commit local de esta fase registra solo documentación/evidencia; no hace push.
