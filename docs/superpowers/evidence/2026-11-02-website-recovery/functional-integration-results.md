# Integración funcional Website — cierre local

**APTO del núcleo integrado en laboratorio. Website completo continúa NO APTO E2E.** No se inicia otra fase ni se integra a main.

## Procedencia y cambios

Base autorizada `c7865f6001d9fb90a51e0f8f6432bcddfa45238d`. Rama independiente `website-functional-integration`: fast-forward al backend `be810546e6790dba4e8300ab38a1858f623a7a39` y merge del frontend `a39a0329b4590b490e4e7aa7af9c2e7b39d23eab`. Merge `ac2e64449`, sin conflictos ni duplicar commits. El commit que incorpora esta acta contiene las correcciones. Ramas de origen y main preservados, sin SSH, push, despliegues ni cambios productivos.

| Defecto / causa | Corrección y archivos principales |
|---|---|
| website.access abría todo /sites/* | `feature-modules.js`, `index.js`, `module-screen-resolver.js`: política explícita por ruta; el servidor filtra authorizedRoutes con permisos efectivos, incluso para manifests instalados antiguos, sin reescribirlos. Patrones completos; /sites/new no coincide como ID. Backend conserva autoridad por operación/pertenencia. |
| C-1 y C-2 aproximados en cliente | `useWebsite.js`, `siteState.js`, `SitePages.jsx`, `SiteSettings.jsx`: estado/capacidades de /state. Backend añade lecturas efectivas omitidas y requisitos compuestos de archivar/reservar. `SiteImport.jsx` distingue importar de preparar/publicar. |
| Publicación basada en escaneo local | `PublishSheet.jsx`: C-3 real de lectura, con página/bloque/causa/recomendaciones; se revalida antes de preparar. Diagnóstico sin recibos, releases ni escrituras en Storage. |
| Formularios ligados al predeterminado o a ID manual | `WebsiteFormsScreen.jsx`, `SiteWorkspace.jsx`, `SiteEditorScreen.jsx`: sitio explícito, selector soportado por builder con formularios propios, C-4/razones/referencias visibles. IDs y respuestas se conservan. |
| C-5 no consumido | `SitePublishing.jsx`: integridad administrativa sellada/histórica/sin verificar; previews no se ofrecen como rollback. No se inventa que una versión haya estado publicada. |
| Borrador nuevo {} bloqueado | `SiteEditorScreen.jsx`: permite inicializar vacío de revisión 0. Documentos no vacíos inválidos se bloquean, sin convertirlos silenciosamente en blanco. |
| Shell interceptaba controles del editor | Offset según cabecera y ruta fullscreen; clicks de navegador sin forzar acciones. |
| Refresco podía recargar el canvas | Guardado/activación excluyen draft de invalidación; revisión inicializada en efecto. No se inventan señales dirty/onChange. |
| iframe consumía grant sin conservar cookie Strict cross-site | `PreviewDialog.jsx`: apertura única en pestaña independiente, noopener y revocación al cerrar. Cambio de presentación para conservar el contrato de seguridad, sin relajar cookies. |
| Runtime existente: POST duplicado 409 y lectura posterior bloqueada en Storage | `website-release-storage.js`: compara bytes existentes antes de repostear; solo 404 permite crear, otros errores cierran la operación. Upload sigue create-only; carreras verifican hash. Probado en Storage real y pruebas unitarias. |
| Settings del asistente no publicables | `NewSiteScreen.jsx`: no persiste giro/buildMode/useCompanyLogo como settings públicos sin contrato; conserva logoFileId. |

No hay migraciones nuevas, purgas, reasignaciones históricas, reemplazo del builder 0.2.4 ni cambios a Commerce Recovery. [Contratos definitivos y transición](../../specs/2026-11-02-website-backend-contracts.md).

## Evidencia

Laboratorio Compose nuevo: servicios Supabase propios, secretos sintéticos, PostgreSQL 17, todas las migraciones y seed reales; Storage privado real. Identidad de base/volúmenes comprobada antes de operar. Frontend completo Vite con AuthProvider/ActiveCompanyProvider/router/builder reales. API completa de `apps/api/src/index.js`, middleware y servicios reales. Chromium aislado, sin perfiles del usuario ni excepciones TLS.

La composición de pruebas aporta solo opciones de instalación al constructor de aislamiento existente: localLab, namespaces localhost y puerto loopback. No sustituye sesión, providers, respuestas, autorización o Storage, ni añade bypass productivo/HTTP. El adaptador de entrada reproduce rewrite público a /public/site. Bindings localhost nuevos en base desechable, sin DNS ni reasignar hosts. Navegador limitado a puertos propios; API bloquea sockets ajenos al laboratorio. El manifest persistido se deja sin las nuevas reglas para probar compatibilidad de una instalación anterior.

| Comprobación | Resultado |
|---|---|
| `node scripts/test-website-functional-browser.mjs` | **16/16**, cero pageerror: login/empresa; crear sitio; crear/editar/guardar/recargar builder; formulario/campo; C-3 sin writes y selector C-4; publicar/C-2; envío público sin sesión; consulta autorizada; segunda versión/C-5/rollback; 409 con recarga explícita; lector; empresa ajena e IDs cruzados opacos; website.access sin acceso a rutas; segundo sitio sin formulario del primero; ZIP/ejecución/cookie/revocación; edit=1 y APIs privadas cerradas en host público. |
| node:test focalizado | **143 casos distintos satisfactorios**: corrida de 141 de autoridad Website, origen/SDK, Storage y utilidades/rutas frontend; luego 17 de los dos servicios modificados, incluyendo dos nuevos (C-1 compuesto y carrera/indisponibilidad Storage). No se repite la suite histórica global. |
| Build frontend | `pnpm --filter @runly/desktop build:web`: correcto; advertencias previas de chunks grandes. |
| Análisis estático | ESLint correcto en JS/JSX/MJS del bloque. React Doctor 87/100, sin errores tras corregir ref durante render; queda una advertencia de complejidad de Publicaciones. |
| Privacidad | `pnpm check:privacy`: **67 hallazgos previos** fuera del bloque; revisión de archivos propios sin hallazgos nuevos. Logs, sesiones, secretos y capturas ignorados. |
| Git | Diff sin errores de whitespace; historial y cambios ajenos preservados. |

Artefactos ignorados: `.artifacts/website-integration/acceptance-results.json`, capturas acceptance-preview.png/acceptance-public.png y logs de build/React Doctor. Intentos de diagnóstico fallidos no cuentan como aceptación: los resultados son de la corrida final corregida.

Reproducir con dependencias e imágenes locales disponibles: `node scripts/fixtures/website-integration-lab.mjs`; en procesos separados ejecutar `node scripts/fixtures/website-integration-server.mjs` y el mismo comando con `--web`; finalmente `node scripts/test-website-functional-browser.mjs`. Finalizar esos procesos y bajar únicamente el proyecto Compose identificado por target.json privado, con sus volúmenes. Se elimina el laboratorio de esta entrega al cerrar.

## Baseline y pendientes efectivos

Se reutilizan S1–S4 y cierre backend: PostgreSQL 18/17, migración/rollback FormScope, Growth/históricos ambiguos, antispam/concurrencia, corpus ZIP/frameworks, Nginx principal/instalador y regresiones Catálogo/Commerce. No cambiaron esos contratos. Aquí se repiten accesos afectados e integración real, incluida guardia de origen. No se certifican checkout ni cobros de módulos ajenos.

| Área | Pendiente real |
|---|---|
| Catálogo | Administración contextual por sitio y aceptación comercial completa; bloques/contratos existentes preservados, sin duplicar inventario. |
| Blog | Pantalla heredada solo predeterminado; faltan UX multisitio y selección de posts en publicación. |
| Menús | Gestión heredada; pendiente contexto multisitio y validación visual de enlaces/publicación. |
| Tema | Tema inicial del asistente funciona; Apariencia completa sigue heredada, pendiente multisitio. |
| Plantillas | Asistente idempotente no atómico; corpus de plantillas y administración por sitio no certificados por probar en blanco. |
| Pagos | Configuración heredada; integración por sitio/cobros no certificados ni modificados. |
| Formularios | Núcleo Website publicado/respuestas APTO en laboratorio; faltan interfaz de resolución histórica, recorridos frontend Growth y funciones avanzadas/exportación. Ambiguos siguen bloqueados explícitamente. |
| Configuración | Identidad/permisos contextuales disponibles. Correo, antispam, analítica y pagos anteriores aún requieren migración contextual. |
| Builder | 0.2.4 sin onChange/onDirtyChange/readOnly público. No se monta editable para lectores. Aviso de guardar antes de salir; dirty local/corpus visual completo pendientes del contrato del paquete. |
| Dominios propios | No disponibles sin autorizar/acreditar infraestructura, DNS, certificados y dominio registrable independiente. Localhost no acredita infraestructura pública. |
| Calendar | Capacidad no disponible; solo bloquea reservas incluidas. Requiere contrato público ejecutable; no se construyen módulo ni automatizaciones. |

Excluir una página conserva su snapshot anterior en el release nuevo, sin modificar releases sellados ni eludir validación de recursos incluidos. Riesgos del núcleo: no detectar dirty local por limitación del paquete; medir listado C-2 por sitio con grandes volúmenes; acreditar aislamiento real en cada instalación. El núcleo no convierte Website completo en APTO E2E.
