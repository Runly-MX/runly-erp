# Cierre funcional de backend Website

Fecha: 2026-11-02. Base autorizada `c7865f6001d9fb90a51e0f8f6432bcddfa45238d`. Rama/worktree independientes `website-backend-closure`. **APTO en laboratorio para el backend implementado; Website continúa NO APTO E2E.** No se integra ni modifica el trabajo React de la rama paralela. El commit que incorpora esta acta es el cierre local, identificable con `git log -1 --format=%H -- docs/superpowers/evidence/2026-11-02-website-recovery/backend-functional-block-results.md`.

## Funcionalidades y causas corregidas

| Pendiente | Implementación |
|---|---|
| E-1: instalador sin gate administrativo | Gate interno y auth_request en entradas/fallbacks del SPA del instalador. API acepta administración solo en hosts configurados/loopback y conserva rutas públicas explícitas. `?edit=1` no monta el editor en el runtime público; React antiguo permanece accesible únicamente en contexto administrativo, con permisos backend. |
| C-1 | Recurso contextual state con capacidades/razones y permisos efectivos del actor, sin sustituir autorización en cada comando. Hosts web y API configurados se distinguen de hosts de contenido. |
| C-2 | Comparación semántica de documentos/metadatos/SEO y agregado builder de identidad, tema, menús, blog y referencias de archivos. No depende de contadores ni updatedAt. Rollback, retirada y publicación parcial conservan significado. El ZIP sigue gestionándose como import/candidato inmutable, sin inventar un borrador editable de archivos. |
| C-3 | Preflight readonly comparte validación builder con prepare; diagnósticos por página/bloque/recurso y recomendaciones. Dist verifica import, bytes, aislamiento y bindings sin escribir. No crea recibos, releases, objetos, eventos ni audits de escritura. La preparación/activación conserva CAS, idempotencia y checks definitivos. |
| C-4 / FormScope | Mapa tipado con pertenencia compuesta, creado atómicamente para formularios nuevos; resolución explícita/auditada de históricos. Website y Growth conservan propietarios/IDs separados, respuestas y permisos de sus módulos. Ambiguos no se atribuyen silenciosamente; la resolución exige ambos permisos. |
| Captura publicada | FormRef en release activo para Website, propiedad activa para Growth externo; validación de origen, definición, campos, antispam, idempotencia y autorización de lectura. Locks cortos revalidan política después de verificación; retirada/deshabilitación/cambio concurrente no admite una respuesta con la política anterior. Metadatos nuevos de scope/definición/sitio/página/release son aditivos y no se inventan para respuestas antiguas. |
| Dependencias de captura | Configuración Turnstile del sitio canónico, bloqueo explícito si es obligatoria y no está configurada; CSP permite solo el proveedor de script/frame necesario. Un responsable histórico ajeno a la empresa también bloquea publicación/notificación. El secreto y datos del usuario ajeno nunca van al público. |
| C-5 | Integridad administrativa uniforme para releases ready verificados, estados sin integridad acreditada e históricos no gestionados. No se crean releases ficticios ni se modifican los sellados. |

Código principal: `website-admin-contract-service.js`, `website-form-scope-service.js`, `website-release-service.js`, contexto/guardia de origen, servicios/rutas Forms y capture existentes, gateway de runtime y plantilla Nginx del instalador. SDK administrativo Website/Growth y clientes públicos se amplían conservando firmas. No se modifica React, el lock, builder 0.2.4, Calendar ni Commerce Recovery.

[DTO y comportamientos definitivos para consumir desde frontend](../../specs/2026-11-02-website-backend-contracts.md). Extensiones de diseño explicadas allí: estado C-4 dependency_unavailable para CAPTCHA sin configurar o responsable no disponible; C-5 unknown para versiones aún no selladas/verificadas; endpoint state contextual aditivo y recomendaciones de preflight declarativas. Se distinguen IDs WebsitePage/WebsiteBlogPost en la atribución de respuestas. La configuración de hosts API es explícita; un host desconocido no adquiere acceso administrativo por carecer de WebsiteDomain.

## Evidencia ejecutada

| Comprobación | Resultado y alcance |
|---|---|
| PostgreSQL 18.6 | **21/21** casos nuevos y **32/32** regresiones S3 del publisher modificado. Migración aditiva con fallo inyectado y rollback, FK/CHECK/RLS/inmutabilidad, preservación de respuesta histórica, permisos y DTO REST/SDK, no writes de preflight, composición/rollback, FormScope Website/Growth y dos conexiones con cambios durante verificación. |
| PostgreSQL 17 | **20/20** nuevas de backend; un caso de navegador omitido expresamente, cubierto en 18. Misma migración y rollback. No se repite la suite histórica completa. |
| Runtime/SDK público real en Chromium 153.0.8010.12 | Incluido en los 21 nuevos: formulario real desde release builder, SDK público, respuesta persistida y nuevo envío rechazado tras retirada. Turnstile script y verificador interceptados en el fixture; no hubo conexión al proveedor. El primer fixture mínimo no cumplía metadata requerida por parsePage y se sustituyó por documento completo del contrato del builder, sin modificar el renderer React. |
| Nginx principal e instalador | **Ambos nginx -t correctos**, 11 peticiones HTTP por configuración y 3 recorridos Chromium por configuración. Dominio público/conocido y desconocido no reciben ADMIN_SHELL por rutas/fallbacks; origen administrativo conserva acceso al shell fixture. Configuraciones reales, guardia API real, upstream y HTML sintéticos propios. No certifica una instalación ya desplegada. |
| Regresiones focalizadas | **195/195**: autoridad Website, Forms, capture/antispam/consentimiento, SDK Website/Growth/público, guardia de origen, Catálogo tenant y Commerce sync guard. Se actualizaron dobles para el scope tipado y política Website canónica; no se retiraron aserciones de seguridad. |
| Análisis estático/privacidad | ESLint de archivos JS/MJS modificados/nuevos y whitespace; inspección de privacidad de archivos del bloque sin hallazgos. `pnpm check:privacy` conserva **67 hallazgos preexistentes** fuera del alcance: no es verde global. |

El runner solo usa contenedores propios etiquetados, tmpfs y puertos loopback; no lee DATABASE_URL/.env ni entra en una red compartida. Prisma se genera con configuración dummy en directorio temporal. El laboratorio Nginx usa su propia red y dos contenedores nuevos; Chromium no usa perfiles/sesiones del usuario, ni excepciones TLS. Finalizados los casos, se apagan/eliminan esos recursos. Ninguna migración se aplicó a una base compartida.

Reproducción: `node scripts/test-website-postgres.mjs --backend-closure` para 21 nuevas + S3 en 18; `--closure-only --postgres17 --skip-browser` para las 20 nuevas de backend en 17; `node scripts/test-website-origin-installer.mjs` para configuraciones HTTP/navegador. Se requieren imágenes locales del runner; no se construyen ni publican imágenes de producto. Las regresiones se ejecutan con node:test sobre los archivos de Forms/capture/SDK/origen modificados más `commerce-sync-guard.test.js` y `catalog-tenant.test.js`.

## Baseline reutilizado y límites

S1–S4 siguen como evidencia de controles y código no alterados: ZIP adversarial y seis toolchains, almacenamiento privado/pinning, aislamiento de preview, comparación y edición/reversión del builder, retención y corpus sintético disponible. No se repiten 267 regresiones ni 81 pruebas PostgreSQL completas por cada cambio. El publisher sí se vuelve a probar porque ahora admite FormRefs resueltos y participa en preflight; la validación integral de React/backend queda reservada al cierre de integración.

Calendar: el bloque existente no implementa disponibilidad/reservas y sus campos públicos están deshabilitados. No hay contrato público para habilitarlo sin ampliar alcance. Permanece capability false y error estructurado dynamic_binding_unavailable, incluso sin calendarId; no se crea un módulo ni automatizaciones nuevas. Formularios normales publicados no dependen de Calendar y ya pueden funcionar con scope correcto.

Bloqueos reales por sitio/selección: mapa histórico sin resolver o ambiguo, owner/empresa/sitio/formulario deshabilitado, CAPTCHA obligatorio sin configuración, Calendar seleccionado, conflictos/integridad del publisher y aislamiento ZIP/preview no configurado. Se conservan exportación/borrado de respuestas bloqueados por retención, integraciones dinámicas de preview deshabilitadas, límites ZIP S4 y dominios públicos sin acreditar DNS/TLS. Atlas-web-builder no adquiere callbacks dirty/readOnly por este cambio.

Persisten la necesidad de resolver históricos mediante comandos autorizados, probar corpus real de clientes, configurar hosts administrativos/API correctos y verificar infraestructura/antispam operativos cuando exista un entorno autorizado. La prueba de widget local no certifica claves reales; el backend falla cerrado si la validación no pasa. No se toman capturas ni se evalúa el diseño de Claude como implementado.

Sin SSH, push, merge de ramas ajenas, despliegues, compras/DNS/certificados, purgas, cambios productivos ni nueva fase iniciada al cerrar.
