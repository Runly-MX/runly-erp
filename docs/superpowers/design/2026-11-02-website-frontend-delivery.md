# Website frontend — entrega de implementación (revisión 1)

Fecha: 2026-11-02. Base: `c7865f6001d9fb90a51e0f8f6432bcddfa45238d`. Rama `website-frontend` en el worktree `runly-website-frontend`. Diseño aprobado: [2026-11-02-website-ux.md](2026-11-02-website-ux.md) (la sección 15 prevalece).

**Website NO está declarado APTO E2E.** Esta entrega implementa la interfaz sobre los contratos S1–S4 existentes. No toca backend, migraciones, gateway ni el paquete atlas-web-builder. Las suites integrales se ejecutan al integrar con el backend.

## 1. Pantallas y recorridos implementados

Rutas bajo `/app/m/runly.website`; el `siteId` siempre viaja en la URL.

| Ruta | Pantalla | Recorrido |
|---|---|---|
| `/` y `/sites` | Sitios web (lista) | Ver todos los sitios, estado, buscar, crear, abrir. |
| `/sites/new` | Crear sitio (3 pasos) | Informativo / con Catálogo / ZIP; nombre e identidad; plantilla o en blanco; progreso por pasos con reintento y "continuar sin este paso". |
| `/sites/:id/overview` | Resumen | Estado, cambios sin publicar, primeros pasos (opcionales descartables). |
| `/sites/:id/pages` | Páginas | Tabla, nueva página, ajustes (título, ruta, visibilidad), eliminar con confirmación. |
| `/sites/:id/pages/:pid/editor` | Editor administrativo | atlas-web-builder 0.2.4, guardado con `expectedRevision`, conflicto 409, vista previa, publicar. |
| `/sites/:id/publishing` | Publicaciones | Versión actual, historial paginado, ver versión, volver a una versión, retirar el sitio. |
| `/sites/:id/domains` | Dominios | Reservar dirección, estado "en preparación" / "Activa", dominio propio "Próximamente". |
| `/sites/:id/import` | Importar ZIP | Estados S4 (validando, rechazado, importado, preparado, publicado) y `isolation_required` informativo. |
| `/sites/:id/settings` | Configuración | Identidad con CAS, "Quién puede qué" (guía), Avanzado, archivar. |
| `/sites/:id/{forms,blog,appearance}` | Secciones heredadas | Pantallas anteriores, solo para el sitio predeterminado (ver 5). |
| `/pages`, `/settings`, `/pages/:id/editor` | Redirecciones | A las rutas por sitio (sitio predeterminado / `siteId` de la página). |

Transversal: barra de contexto del sitio (selector, estado, Vista previa, Publicar), hoja de publicación (revisar → preparar → activar), vista previa en iframe aislado (`POST /previews`, revocada al cerrar), mensajes de error unificados por código.

## 2. Componentes y archivos

Nuevos, en `apps/desktop/src/modules/runly.website/`: `lib/` (`websiteApi`, `websiteErrors`, `siteState`, `publishability`, `capabilities`, `pageRoute`, `sitesPath`, `localBackup`), `hooks/useWebsite.js`, `components/` (`SiteContextBar`, `SiteStatusChip`, `PublishSheet`, `PreviewDialog`, `ConflictDialog`, `EditorTopBar`, `ErrorNotice`, `CapabilityButton`, `FormsPublishNotice`), `screens/sites/` (12 pantallas y el router). Herramienta de pruebas: `apps/desktop/website-harness/`.

**Archivos existentes modificados (compartidos o heredados), con su motivo:**

| Archivo | Cambio |
|---|---|
| `src/app/module-screen-resolver.js` | Rutas `/sites/*`, redirecciones heredadas y **permiso de navegación para `/sites/*` cuando el usuario ve la entrada raíz de Website**. |
| `src/app/ModuleOutlet.jsx` | Registro de las pantallas nuevas; el editor antiguo ahora redirige. |
| `screens/WebsiteFormsScreen.jsx` | Aviso de formularios no publicables (1 import + 1 línea). |
| `screens/wizard/WizardStepTemplate.jsx`, `WizardStepIdentity.jsx` | Solo acentos en textos visibles (reutilizados por el asistente nuevo). |

No se eliminó código: `WebsiteOverviewScreen`, `WebsitePagesScreen`, `WebsiteWizard`, `WebsitePageEditorScreen`, `PublicWebsiteEntry` (`?edit=1`) y el resto siguen en el repositorio. `WebsiteWizard` y `WebsiteOverviewScreen` ya no se enrutan.

## 3. Contratos utilizados

| Uso | Contrato |
|---|---|
| Lista / alta / detalle de sitios | `GET/POST /website/sites` (+ `Idempotency-Key`), `GET /website/sites/:id` |
| Identidad | `PATCH /website/sites/:id` `{identity, expectedRevision}` |
| Páginas | `GET/POST /website/sites/:id/pages`, `GET/PUT .../pages/:pid/draft` (`expectedRevision`, `documentHash`, `issues`), `DELETE /website/pages/:id`, `GET /website/pages/:id` (solo para la redirección heredada) |
| Tema | `GET /website/theme?siteId=`, `POST /website/theme` |
| Publicación | `POST .../releases` (builder y `kind:dist`), `GET .../releases[/:id]`, `POST .../publication/{activate,rollback,unpublish}` |
| Dominios | `GET/POST .../domains` `{slug}` |
| Vista previa | `POST .../previews` (`{releaseId}` o comando builder), `DELETE .../previews/:id` |
| ZIP | `POST .../imports` (multipart), `GET .../imports/:id` |
| Archivar | `DELETE /website/site/:id` (archiva sin cascada) |
| Errores | Los códigos del mapa `lib/websiteErrors.js`, tomados de las actas S1–S4 |

Cliente propio `lib/websiteApi.js` sobre `companyFetch` (cabecera de empresa), con error normalizado `{status, code, message, fields, requestId}`. No se usó `@runly/sdk` porque su `request` no entrega `code`/`fields` normalizados; los paths y cuerpos son los mismos que los métodos del SDK Website.

## 4. Evidencia

- **Pruebas unitarias focalizadas:** `node --test apps/desktop/src/modules/runly.website/lib/__tests__/website-lib.test.js` (7/7) y `node --test apps/desktop/src/app/__tests__/website-routes.test.js` (3/3).
- **Navegador real (Chromium/Playwright), 35/35:** `node apps/desktop/website-harness/run.mjs`. Renderiza las **pantallas reales** con las funciones `useAuth`/`useActiveCompany` sustituidas y la red servida por un **fixture del contrato** (`fixture-api.mjs`: CAS de revisión, códigos 409, idempotencia, máquina de estados del release). Comprueba: lista y estados; redirecciones heredadas; crear página y abrir el editor administrativo; guardado con `PUT` y `expectedRevision`; conflicto 409 con salida "guardar como página nueva" (copia privada) sin sobrescribir; publicar (revisar → preparar → activar → listo); bloqueo de formulario con preflight local, fallo `form_scope_unresolved` explicado sin cambiar el sitio y exclusión de la página; rollback rechazado en línea y rollback correcto; retiro con confirmación explícita; asistente con fallo inyectado, reintento sin duplicados; dominios (reservada, "Próximamente", sin afirmar HTTPS, `hostname_taken`); identidad con conflicto de revisión; archivar con nombre exacto; ZIP `isolation_required` y archivo rechazado sin promesas de frameworks; permisos de solo lectura (Publicar deshabilitado con razón, editor "Solo lectura"); móvil 390 sin scroll horizontal; tema oscuro; secciones heredadas rechazadas para sitios no predeterminados; sin errores de página.
- **Capturas** (locales, no versionadas): `apps/desktop/website-harness/.shots/` (19 imágenes: lista, resumen, páginas, editor, conflicto, publicación, bloqueo de formulario, rollback, asistente, dominios, configuración, ZIP, solo lectura, móvil, oscuro) y `results.json`.
- `eslint` de `modules/runly.website`, `src/app` y el harness, sin hallazgos. `pnpm build:web` correcto.

**Qué NO prueba esta evidencia:** no es E2E contra el backend ni contra una base de datos; el fixture reproduce el contrato documentado, no el comportamiento real del servidor. No se probó el shell completo (AppShell, sesión real, selector de empresa), ni la vista previa real en origen aislado (el iframe apunta a una página del fixture), ni touch real, ni lector de pantalla. La accesibilidad se revisó por roles, nombres y teclado básico en la lógica; no se ejecutó una auditoría automática.

## 5. Dependencias pendientes (no inventadas ni simuladas)

| Pendiente | Efecto actual y cómo conectar |
|---|---|
| **Manifiesto `runly.website` (backend):** declarar `fullscreenPaths` o una entrada "Mis sitios" con `path: '/sites'` | Hoy el permiso de navegación para `/sites/*` se concede en el resolver del frontend si el usuario ve la entrada raíz (`website.access`). Cuando el manifiesto declare la ruta, se puede quitar esa excepción de `module-screen-resolver.js`. Pendiente también: etiquetas sin acentos del manifiesto. |
| **C-1 capacidades y permisos efectivos** | `useWebsiteCapabilities` deriva de los permisos de sesión (`CAPABILITY_SOURCE='derived'`) y de restricciones conocidas. Al existir `capabilities` por sitio, reemplazar `buildCapabilities` leyéndolas del `SiteDTO`; las pantallas no cambian. |
| **C-2 `hasUnpublishedChanges` por sitio y página** | El chip compara `draftRevision` del sitio con la del release activo (aproximado, lo dice la interfaz). La lista de sitios no carga el release activo, por lo que muestra "Publicado" sin el sufijo. Sin indicador por página; la columna "En el sitio público" usa la proyección `status` de la página. |
| **C-3 preflight estructurado** | `PublishSheet` hace un análisis local **informativo** (`lib/publishability.js`) de los borradores y, al fallar, muestra el `failureCode` mapeado. Sin enlace autoritativo al bloque. Conectar: sustituir `analyzeDocument` por la respuesta con `{severity, code, pageId, blockId, resource, remediation}` y habilitar/deshabilitar "Preparar" según `canPublish`. |
| **C-4 `publishability` por formulario** | La pantalla de formularios muestra un aviso global (`FormsPublishNotice`). Faltan insignia por bloque, columnas "Publicable"/"Se usa en" y el selector `formPicker`; requieren C-4 y un campo personalizado en `runlyBlocks/` (el bloque sigue pidiendo el ID a mano). |
| **C-5 integridad del release** | El historial no etiqueta `sealed`/`legacy-reference`. |
| **DTO de release sin "alguna vez publicada"** | "Volver a esta versión" se ofrece a toda versión `ready` no activa; si el servidor responde `rollback_not_published`, se explica en el diálogo sin cambiar nada. Un campo `publishedAt`/`everActivated` evitaría ofrecerlo en vano. |
| **Actor del release** | El historial muestra fecha, no persona (`actorId` sin resolver a nombre). |
| **atlas-web-builder 0.2.4 sin `onChange`/`onDirtyChange`/`markSaved`/`readOnly`/ref** | La barra no afirma "cambios sin guardar"; avisa con un texto fijo. No hay botón Guardar propio (no hay forma de leer la página desde fuera): se usa el "Guardar borrador" del editor, y "Publicar lo guardado" publica solo lo ya guardado. El botón "Publicar" del editor guarda y abre la hoja. Sin `readOnly`, un usuario sin permiso ve el editor con un aviso, y el guardado queda bloqueado en la aplicación. |
| **Secciones heredadas sin `siteId`** (Blog, Formularios, Tema, Menús, Plantillas, Pagos, y la pantalla anterior de correo/antispam en `/settings/legacy`) | Funcionan solo con el sitio predeterminado; para otro sitio se muestra un aviso en lugar de editar el equivocado. Necesitan rutas y pantallas con `siteId`. La pantalla anterior de configuración todavía incluye el panel de ZIP antiguo con logos de frameworks; debe retirarse al migrarla. |
| **Catálogo por sitio** | No hay sección Catálogo (fuera de este alcance). El selector de productos del editor ahora filtra `published=true`. |
| **Retiro de `?edit=1` en el host público (E-1)** | `PublicWebsiteEntry` y `WebsitePageEditorScreen` no se tocaron. Pendiente: confirmación de Codex y cambio aparte. |
| **Ayuda del módulo** (`apps/api/src/manifests/official/help/runly.website/*.md`) | Describe las pantallas anteriores; es contenido de backend y no se modificó. |
| **Creación atómica de sitio con plantilla (D-6)** | El asistente orquesta 4–5 llamadas idempotentes con reintento; la creación no es transaccional. |

## 6. Estado del worktree

Rama `website-frontend`, creada desde la base integrada; no se modificó el worktree de Codex ni el repositorio principal. Sin push ni despliegue.
