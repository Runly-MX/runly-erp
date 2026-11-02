# Runly Website — auditoría y diseño UX/UI integral

Fecha: 2026-11-02. Autor: Claude (UX/UI y futuro frontend). Backend y contratos: Codex.
Base de lectura: `efce9ea5586340a53920f0561b74bc38d0919fab` (cierres S1, S2 y S3). S4 (ZIP, vista previa, atlas-web-builder) está en curso en el repositorio principal y **no se asume cerrado**.

**Estado de este documento: propuesta de diseño para revisión. No hay código de producción, ni cambios en backend, base de datos, migraciones, contratos, atlas-web-builder o documentos maestros de Codex.** Website completo sigue NO APTO E2E; ninguna pantalla de aquí se debe construir como definitiva hasta que su contrato esté en la columna "disponible" de la sección 10.

Convenciones: `Hecho` = verificado en código o actas citadas. `Propuesta` = decisión de diseño. `Dependencia` = requiere algo que backend aún no entrega. Los textos de interfaz propuestos van en español con acentos; el código y este documento técnico siguen la convención del repositorio.

---

## 0. Resumen ejecutivo

1. El Website actual es una colección de pantallas pensadas para **un solo sitio, publicado página por página**. Tras S1–S3 el backend es **multisitio, con borradores revisionados y releases inmutables**. El frontend actual contradice esos contratos en seis puntos que hoy fallan o engañan al usuario (sección 2: P-01 a P-06).
2. La propuesta cambia el modelo mental del usuario a tres ideas simples: **Mis sitios** (lista), **Borrador** (lo que edito, privado) y **Publicado** (la versión que ve el público). Publicar es una acción del **sitio completo**, explícita y reversible.
3. Un sitio se crea en **3 pasos** (cómo construirlo, nombre e identidad, plantilla/páginas). Catálogo, formularios, dominio y ZIP son **opcionales** y aparecen después como una lista de "Primeros pasos", nunca como requisito.
4. Se conserva el motor atlas-web-builder. Se mueve su montaje a una ruta administrativa con barra propia (guardado con revisión, conflictos 409, publicar con hoja de revisión). Se piden **dos cambios aditivos** al paquete (señal de cambios sin guardar y modo solo lectura); sin ellos hay un degradado definido (sección 6.5).
5. Todo lo que backend no acredita se diseña como **estado "no disponible aún" honesto**: publicación de páginas con formularios (`form_scope_unresolved`), Calendar, dominios propios, importación ZIP (`isolation_required`), exportación y borrado de respuestas, vista previa aislada.

Decisiones que necesito confirmadas están en la sección 13.

---

## 1. Auditoría UX/UI del Website actual

### 1.1 Inventario (Hecho)

Todas las rutas bajo `/app/m/runly.website/...`. Navegación declarada en `apps/api/src/manifests/official/feature-modules.js` (módulo `runly.website`, v0.3.0).

| Superficie | Archivo | Qué hace hoy |
|---|---|---|
| Resumen | `modules/runly.website/screens/WebsiteOverviewScreen.jsx` (342 líneas) | Si no hay sitio muestra el asistente a pantalla completa; si lo hay, estadísticas, nombre/dominio/tipo editables, interruptor Publicado/Borrador y "Zona de peligro". Lee `GET /website/site` (un único sitio). |
| Asistente | `WebsiteWizard.jsx` + `wizard/*` (5 pasos web, 2 ZIP) | Modo, información, tipo, identidad, plantilla. Crea sitio, tema y páginas con **llamadas consecutivas sin transacción ni clave de idempotencia**. |
| Páginas | `WebsitePagesScreen.jsx` | Tabla con interruptor Publicar/Despublicar **por página**, eliminar y nueva página. |
| Editor | `WebsitePageEditorScreen.jsx` + `website/EditorContextBar.jsx` + `shell/PublicWebsiteEntry.jsx` | Monta `AtlasWebBuilderEditor`. Desde el shell redirige a la **URL pública con `?edit=1`**, donde `PublicWebsiteEntry` renderiza barra + editor. |
| Blog | `WebsiteBlogScreen.jsx`, `WebsiteBlogPostEditorScreen.jsx` | CRUD de entradas (fuente distinta a la pública, WR-13). |
| Tema / Plantillas / Menús | `WebsiteThemeScreen.jsx`, `WebsiteTemplatesScreen.jsx`, `TemplatePreviewScreen.jsx`, `WebsiteMenusScreen.jsx` | Edición de tokens, plantillas y menús del sitio. |
| Formularios | `WebsiteFormsScreen.jsx` (608 líneas) | Lista, detalle, respuestas, diálogo de alta con 10 controles, copiar ID. |
| Pagos | `WebsitePaymentsScreen.jsx` | Configuración de cobro. **Fuera del alcance de este diseño.** |
| Configuración | `WebsiteSettingsScreen.jsx` (537 líneas) | Pestañas: origen (builder/ZIP), SMTP, antispam/analítica. |
| ZIP | `components/DistUploadPanel.jsx` (655 líneas), `WebsiteSourceSelector.jsx` | Subida de ZIP con logos React/Astro/Next.js y guía por framework. |

### 1.2 Lo que funciona y se conserva

- Uso consistente de `PageHeader`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `LoadingState` en Páginas, Formularios y Configuración.
- `ConfirmDialog` para borrar páginas (`WebsitePagesScreen.jsx:248`), sin diálogos nativos.
- El motor atlas-web-builder: paleta de bloques, panel de propiedades por grupos, **Deshacer/Rehacer**, vista previa Escritorio/Tablet/Móvil, medios y plantillas ya existen (verificado en `dist/` y README del paquete 0.2.0). No se reescribe nada.
- Secretos (SMTP, Turnstile) nunca se devuelven al cliente; la UI ya los trata como "configurado / dejar en blanco" (`WebsiteSettingsScreen.jsx:247-248, 411`).
- Bloques Runly (productos, formulario de contacto, reservas, blog) ya consultan Catálogo público en vivo y no duplican productos.

---

## 2. Problemas confirmados con evidencia

Severidad: **Crítico** = hoy falla o contradice un contrato; **Alto** = causa pérdida de trabajo o confusión grave; **Medio** = fricción; **Bajo** = pulido.

### 2.1 Contradicciones con los contratos S1–S3

| ID | Sev. | Problema | Evidencia |
|---|---|---|---|
| P-01 | Crítico | **El interruptor Publicado/Borrador del Resumen cambia `status` por PATCH.** En sitios gestionados por releases, S3 responde 409 `publication_requires_explicit_action`. Además publicar un sitio entero es una acción de bajo esfuerzo y alto impacto presentada como un switch. | `WebsiteOverviewScreen.jsx:159-161, 182-186`; acta S3 ("cambios directos de status/origen ambiguos dan `publication_requires_explicit_action`"). |
| P-02 | Crítico | **Publicar y despublicar por página** usan `POST /pages/:id/publish` y `PATCH {status:'draft'}`. El modelo vigente publica un release del sitio con páginas seleccionadas; las transiciones por PATCH quedan bloqueadas en sitios gestionados. | `WebsitePagesScreen.jsx:57, 66-68`; `EditorContextBar.jsx:339, 355`; acta S3. |
| P-03 | Crítico | **El camino ZIP del asistente termina en 409.** Crea el sitio, escribe `settings.buildMode`, y luego `PATCH sourceType:'dist'`, que S1/S3 devuelven como `isolation_required`. Deja un sitio huérfano en borrador y un mensaje de error genérico. | `WebsiteWizard.jsx:97-113`; acta S1 ("activar/subir ZIP devuelve 409 `isolation_required`"). |
| P-04 | Crítico | **El editor vive en la URL pública (`?edit=1`) dentro de `PublicWebsiteEntry`.** S3 separó el runtime público (`public-release-entry.jsx`: sin AuthProvider, sin editor, `credentials:'omit'`) y añadió un guardia de origen que impide rutas administrativas desde hostnames públicos. Un editor que depende de sesión ERP en el host público es incompatible con ese aislamiento. Debe confirmarse con Codex (sección 10.3, DS-1). | `WebsitePageEditorScreen.jsx:161-167`; `shell/PublicWebsiteEntry.jsx:683-697, 859, 873, 1005-1009`; `website/public-release-entry.jsx`; acta S3 (`website-origin-guard.js`). |
| P-05 | Alto | **Un solo sitio implícito.** Todas las pantallas llaman `GET /website/site`, que devuelve el default fijado al migrar, no el sitio recién creado. Con dos sitios el usuario edita siempre el mismo sin saberlo. | `WebsiteOverviewScreen.jsx:63-68`, `WebsitePagesScreen.jsx:41-43`, `WebsiteFormsScreen.jsx:373-379`, `WebsiteSettingsScreen.jsx:95`; acta S2 ("Legacy `/website/site` sigue devolviendo el default… no el sitio recién creado"). |
| P-06 | Alto | **Guardado sin revisión ni manejo de conflicto.** `POST /pages/:id/draft` sin `expectedRevision` entra en modo `legacy_last_write_wins`; cualquier error se muestra como un toast con `err.message`. No hay `revision_conflict` ni preservación del trabajo local. | `WebsitePageEditorScreen.jsx:135-146`; acta S2 ("no se promete protección de edición simultánea al cliente viejo"). |

### 2.2 Problemas de experiencia

| ID | Sev. | Problema | Evidencia |
|---|---|---|---|
| P-07 | Alto | **Editor sin estado de guardado.** El toast "Borrador guardado" aparece al responder el servidor; no hay "Guardando…", "Sin guardar", ni hora del último guardado. El usuario no sabe si sale perdiendo cambios. El paquete solo expone `onSaveDraft` y `onPublish`, sin señal de cambios pendientes. | `WebsitePageEditorScreen.jsx:141-145, 250-251`; README del paquete (tabla de props). |
| P-08 | Alto | **El usuario no sabe si edita borrador o publicado.** No existe una indicación persistente. El botón del editor muestra el *estado* ("Publicado") donde debería haber una *acción* ("Publicar"). | `EditorContextBar.jsx:339-355`. |
| P-09 | Alto | **Alta de sitio no atómica y no reanudable.** 6+ llamadas consecutivas (sitio, PATCH settings, tema, subida de logo, N páginas, N drafts) sin clave de idempotencia; un fallo intermedio deja un sitio a medias y el toast muestra solo el último error. | `WebsiteWizard.jsx:86-200`; maestro §2 fila 2. |
| P-10 | Alto | **Dominio como texto libre** en asistente y Resumen. Con el gateway estricto (S3) un hostname solo sirve si está registrado en `website_domain`; escribir un dominio aquí no lo activa. | `WebsiteOverviewScreen.jsx:259-264`, `wizard/WizardStepInfo.jsx`; acta S3 (registro único, 404 para desconocidos). |
| P-11 | Alto | **La "Zona de peligro" promete algo falso.** Dice "borra de forma permanente todas las páginas, posts, formularios, menús y temas", pero S1 archiva sin cascada y conserva datos. Además el texto de confirmación solo habilita el botón al escribir el nombre exacto, lo cual es correcto, pero el resultado no coincide con el aviso. | `WebsiteOverviewScreen.jsx:287-299, 312-316`; acta S1 (`DELETE /website/site/:id` archiva). |
| P-12 | Alto | **IDs manuales.** Para insertar un formulario hay que copiar su ID y pegarlo en el bloque; la pantalla de formularios ofrece "Copiar ID" en tres lugares como solución. | `WebsiteFormsScreen.jsx:180, 216`; maestro §5 ("ContactFormBlock pide ID manual"). |
| P-13 | Medio | **El selector de productos del editor usa el listado administrativo** de Catálogo sin filtro de publicación. Se pueden elegir productos que el público nunca verá. | `WebsitePageEditorScreen.jsx:255-261` (`/catalog/products`); maestro §4 (visible = `published`). |
| P-14 | Medio | **Promesa de compatibilidad con frameworks.** El panel ZIP muestra logos y guías para React, Astro y Next.js. El maestro los mantiene "NO PROBADO E2E": los fixtures son sintéticos, y SSR no se ejecuta. | `DistUploadPanel.jsx:138-140, 203-208`; maestro §6. |
| P-15 | Medio | **Diálogo de formulario sobrecargado.** Alta con 10 controles (honeypot, Turnstile, modo wizard, lead, notificación…) antes de que exista un solo campo; las opciones avanzadas compiten con lo esencial (nombre y campos). | `WebsiteFormsScreen.jsx:266-350`. |
| P-16 | Medio | **Clave de caché por token, no por empresa/sitio.** `queryKey: ['website-site', token]` hace que el caché dependa de la sesión; el contrato exige aislar por empresa y sitio y cancelar al cambiar de empresa. | `WebsiteOverviewScreen.jsx:64`; contratos §10. |
| P-17 | Medio | **`apiFetch` copiado en cada pantalla** (≥10 copias) con manejo de error mínimo (`err.error || HTTP n`); no lee `code`, `fields`, `requestId` ni distingue 401/403/404/409. | primeras líneas de cada pantalla; SDK ya expone dominio Website (acta S2/S3). |
| P-18 | Medio | **Asistente a pantalla completa** (`fixed inset-0 z-50`) con X que navega a `/app/home`; no hay forma de crear un segundo sitio desde un sitio existente. | `WebsiteWizard.jsx:~252-260`; `WebsiteOverviewScreen.jsx:144`. |
| P-19 | Bajo | **Marca y valores por defecto incorrectos en el editor**: `brandName="Runly ERP"`; `siteType` por defecto `"informational"` (los valores reales son `website/ecommerce/blog/landing`), lo que desactiva silenciosamente bloques según tipo. | `WebsitePageEditorScreen.jsx:231, 249`. |
| P-20 | Bajo | **Tema oscuro roto en zonas rojas.** Colores fijos `border-red-200`, `text-red-700`, `text-red-400` en lugar de tokens del sistema. | `WebsiteOverviewScreen.jsx:287-288`; `WebsitePageEditorScreen.jsx:215`. |
| P-21 | Bajo | **Textos sin acentos** en interfaz: "Configuracion", "Diseno", "Pagina publicada", "Paginas". | `feature-modules.js` (etiquetas de navegación); varias pantallas. |
| P-22 | Bajo | **Descripción desactualizada**: el manifiesto dice "editor Puck"; el motor es atlas-web-builder. | `feature-modules.js` (`summary`). |

### 2.3 Hallazgos de arquitectura de información

- Seis entradas de menú en cuatro grupos ("Contenido / Diseño / Negocio / Configuración") mezclan **lo que se hace con el sitio** (páginas, blog) con **ajustes de infraestructura** (SMTP, Turnstile, origen del sitio) sin jerarquía de frecuencia de uso.
- Nada comunica el **ciclo de vida**: borrador, versión publicada, historial. Los releases y el rollback existen en backend (S3) y no tienen superficie alguna.
- No hay ningún lugar donde ver **dominios**, **versiones** ni **quién puede hacer qué**.

---

## 3. Arquitectura de información propuesta

### 3.1 Modelo mental (tres conceptos)

| Concepto | Qué significa para el usuario | Qué es en el backend |
|---|---|---|
| **Sitio** | Un sitio web de la empresa. Puede haber varios. | `WebsiteSite` (id, `defaultForCompany`, `lifecycle`). |
| **Borrador** | Lo que estoy editando. **Es privado** hasta que lo publique. | `draftRevision`, páginas con `revision`, `draftBuilderData`, `draftIdentity`. |
| **Versión publicada** | Lo que ve el público ahora. Se puede volver a una anterior. | `WebsiteRelease` activo (`activeReleaseId`), historial, rollback. |

Regla de lenguaje: se usa **"Publicar"** (acción sobre el sitio), **"Guardar"** (acción sobre una página en borrador), **"Versión"** (un release), **"Volver a esta versión"** (rollback), **"Retirar el sitio"** (unpublish) y **"Archivar"** (archive). Se evita "Release", "CAS", "manifiesto", "despublicar página".

### 3.2 Niveles

```text
Website (módulo)
├─ Mis sitios                      lista + crear
└─ Sitio (espacio de trabajo)      barra de contexto fija: nombre, selector, estado, Vista previa, Publicar
   ├─ Resumen                      estado, primeros pasos, accesos rápidos
   ├─ Páginas                      lista, nueva, ajustes de página, editor
   ├─ Blog                         entradas (ver 8.4: dependencia WR-13)
   ├─ Formularios                  definición, campos, respuestas
   ├─ Catálogo                     qué productos se ven en el sitio
   ├─ Apariencia                   tema, menús, plantillas
   ├─ Publicaciones                versión actual, historial, volver a una versión, retirar
   ├─ Dominios                     dirección del sitio
   ├─ Importar ZIP                 solo para sitios de origen ZIP (ver 8.6)
   └─ Configuración                identidad, SEO por defecto, quién puede qué, avanzado (correo, antispam, pagos, archivar)
```

Lo frecuente (Páginas, Publicar) queda a un clic; lo raro y técnico (SMTP, Turnstile, archivar) queda en **Configuración > Avanzado**, plegado.

### 3.3 Qué se obliga y qué es opcional

| Elemento | ¿Obligatorio? | Dónde aparece |
|---|---|---|
| Nombre, tipo de construcción | Sí | Asistente |
| Identidad (color, logo, tipografía) | No, con valores por defecto | Asistente (paso 2) y Apariencia |
| Plantilla / páginas iniciales | No (se puede empezar en blanco) | Asistente (paso 3) |
| Catálogo | No | Primeros pasos + sección Catálogo |
| Formularios | No | Primeros pasos + sección Formularios |
| Dominio | No (el borrador funciona sin dirección) | Primeros pasos + sección Dominios |
| SMTP, Turnstile, analítica | No | Configuración > Avanzado |

---

## 4. Mapa de navegación

### 4.1 Rutas propuestas (Propuesta)

Todas bajo `/app/m/runly.website`. El `siteId` está **siempre en la ruta** (contratos §10: nunca un sitio implícito).

```text
/sites                                   Mis sitios
/sites/new                               Crear sitio (asistente en página, no modal fijo)
/sites/:siteId                           -> redirige a /overview
/sites/:siteId/overview
/sites/:siteId/pages
/sites/:siteId/pages/:pageId/editor      editor a pantalla completa (ruta administrativa)
/sites/:siteId/pages/:pageId/settings    ajustes de página (título, ruta, SEO) como Sheet sobre la lista
/sites/:siteId/blog                      (y /blog/:postId/editor)
/sites/:siteId/forms                     (y /forms/:formId)
/sites/:siteId/catalog
/sites/:siteId/appearance                (tabs: Tema, Menús, Plantillas)
/sites/:siteId/publishing                (versión actual, historial)
/sites/:siteId/domains
/sites/:siteId/import
/sites/:siteId/settings
```

Compatibilidad: las rutas actuales (`/pages`, `/forms`, `/settings`, `/pages/:id/editor`…) redirigen al sitio por defecto (`defaultForCompany`) o, si no hay uno, a `/sites`. Se mantiene `LegacyPublicRedirect` donde ya exista.

### 4.2 Navegación del shell

El manifiesto declara navegación estática. Propuesta de menú del módulo (permisos como hoy):

```text
Sitio web
├─ Mis sitios            (website.access)
└─ (dentro de un sitio, la navegación del sitio vive en un panel lateral propio del espacio de trabajo)
```

La navegación dentro del sitio es un **panel lateral de sección** (en escritorio) y un **selector de sección** (en móvil), no entradas del menú global del ERP. Esto evita que el menú global dependa del sitio activo y deja al manifiesto con una sola entrada.

```text
[Mis sitios] > Cafetería La Esquina  ▾        [Borrador · cambios sin publicar]   [Vista previa] [Publicar ▸]
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ Resumen      │                                                               │
│ Páginas      │               contenido de la sección                         │
│ Blog         │                                                               │
│ Formularios  │                                                               │
│ Catálogo     │                                                               │
│ Apariencia   │                                                               │
│ Publicaciones│                                                               │
│ Dominios     │                                                               │
│ Configuración│                                                               │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

### 4.3 Barra de contexto del sitio (`SiteContextBar`)

Fija, visible en todas las secciones y en el editor (versión compacta).

- Izquierda: `Mis sitios` (ruta) › **nombre del sitio** con selector (`DropdownMenu` con los sitios de la empresa, marca "predeterminado").
- Centro/derecha: **chip de estado** (ver 8.1) y, solo en el editor, "Editando borrador".
- Derecha: `Vista previa` (secundario) y `Publicar` (principal). Si el usuario no tiene `website.pages.publish`, `Publicar` queda deshabilitado con tooltip "Necesitas el permiso de publicación".
- Al cambiar de sitio o de empresa se **cancelan las consultas** y no se reutiliza caché cruzado (claves `['website', companyId, siteId, ...]`).

---

## 5. Recorridos principales

Cada recorrido indica el contrato que consume. `[D]` = dependencia no disponible (sección 10).

### J1. Crear un sitio (informativo, con Catálogo o ZIP)

1. En **Mis sitios** pulsar `Crear sitio`. Si no hay sitios, el estado vacío ocupa la pantalla con la misma acción.
2. **Paso 1 — Cómo quieres construirlo.** Tres tarjetas:
   - `Sitio informativo` (editor visual, sin tienda). *Recomendado por defecto.*
   - `Sitio con Catálogo` (editor visual + productos publicados de Catálogo).
   - `Importar un sitio ya hecho (ZIP)` — muestra, según capability, "Disponible" o "No disponible en esta instalación todavía".
3. **Paso 2 — Nombre e identidad.** Nombre (obligatorio), a qué se dedica (opcional), color principal, logo (subir o usar el de la empresa), tipografía. Todo con valores por defecto. **No se pide dominio.**
4. **Paso 3 — Punto de partida** (solo editor visual). `Empezar en blanco` o elegir plantilla y marcar páginas. Vista previa de plantilla como hoy (`TemplatePreviewScreen`).
5. **Creación.** Diálogo de progreso con lista de pasos (sitio, tema, logo, páginas) y estado por paso; cada paso con su propia clave de idempotencia. Si uno falla: el sitio **ya existe como borrador**, el paso fallido muestra `Reintentar`, y se puede `Continuar sin esto`. Al terminar se entra al **Resumen** del nuevo sitio con "Primeros pasos".
6. Contratos: `POST /website/sites` (+ `Idempotency-Key`), `PATCH /website/sites/:id` (`identity`, `expectedRevision`), `POST /website/theme`, `POST /website/sites/:id/pages`, `PUT .../pages/:pageId/draft`. `[D]` la creación atómica con plantilla (contratos v1 §5) no existe: se orquesta en cliente con reanudación.
7. Camino ZIP: crea el sitio en borrador y lleva a **Importar ZIP** (8.6). **No** hace `PATCH sourceType`.

### J2. Primeros pasos (Resumen de un sitio nuevo)

Lista de verificación que se reduce a medida que se completa; cada ítem opcional se puede descartar ("No lo necesito"):

1. Revisar y editar tus páginas.
2. Agregar contenido (abre el editor en la primera página).
3. Conectar Catálogo (opcional).
4. Agregar un formulario de contacto (opcional) — `[D]` publicación con formularios, ver 8.4.
5. Elegir la dirección del sitio (opcional).
6. Ver una vista previa.
7. Publicar.

### J3. Editar una página

Páginas › `Editar` › editor a pantalla completa › `Guardar` › (opcional) `Vista previa` › `Publicar`. Detalle en 6.5.

### J4. Publicar

`Publicar` (barra de contexto o editor) › **Hoja de publicación** (6.7): revisión, preparación, confirmación. Sin edición de contenido dentro del flujo.

### J5. Volver a una versión anterior / retirar el sitio

Publicaciones › historial › `Volver a esta versión` (rollback) o `Retirar el sitio` (unpublish), ambos con confirmación explícita (6.8).

### J6. Varios sitios

Mis sitios › selector en la barra de contexto o tarjeta › entrar. Crear otro sitio no cambia el activo. El sitio predeterminado se marca con una etiqueta, no con una posición.

### J7. Formulario de contacto de punta a punta

Formularios › `Nuevo formulario` (nombre + campos) › en el editor, bloque `Formulario` con **selector** (no ID) › publicar › consultar respuestas. Limitado hoy por `form_scope_unresolved` (8.4).

### J8. Mostrar productos de Catálogo

Catálogo (sección) › marcar `Visible en el sitio` › en el editor insertar `Productos` con selector › publicar (los productos se leen en vivo, no se congelan) (8.5).

---

## 6. Diseño detallado de pantallas

Wireframes en ASCII para fijar estructura, no pixeles. Todo con componentes de `@runly/ui` (sección 7). Anchos: escritorio ≥1024, tablet 640–1023, móvil <640.

### 6.1 Mis sitios (`/sites`)

`PageHeader` (título "Sitios web", descripción "Crea y administra los sitios de tu empresa", acción `Crear sitio`). Cuerpo: `RunlyTable` con vista tarjetas (precedente: lista de productos de Catálogo, commit `727257a1f`).

```text
Sitios web                                                          [Crear sitio]
Buscar sitio…                                              Estado: Todos ▾

┌ Cafetería La Esquina  · predeterminado ─────────────────────────────────────┐
│ Sitio con Catálogo     Publicado · cambios sin publicar                      │
│ cafe-esquina.sitios.example.com · Publicado hace 2 días por Ana       [Abrir ▾]│
└──────────────────────────────────────────────────────────────────────────────┘
┌ Landing temporada ──────────────────────────────────────────────────────────┐
│ Sitio informativo      Borrador (sin publicar)                               │
│ Sin dirección todavía                                                 [Abrir ▾]│
└──────────────────────────────────────────────────────────────────────────────┘
```

Columnas (tabla): Nombre (+ etiqueta predeterminado) · Tipo · Estado · Dirección · Última publicación · Acciones (`ActionMenu`: Abrir, Vista previa, Publicaciones, Archivar).
Estados vacío / carga / error: `EmptyState` con acción; `LoadingState` (skeleton de filas); `ErrorState` con `Reintentar` y `requestId` en detalle plegado.
Datos: `GET /website/sites` (id, name, siteType, defaultForCompany, draftRevision, lifecycle*, activeReleaseId*). *`[D]` `lifecycle` y `activeReleaseId` en el listado: confirmar que están en la fila del listado S2/S3 (el acta S3 los añade a `WebsiteSite`; el listado S2 no los enumera).* `Última publicación` requiere el release activo (`GET .../releases/:id`) o un campo en la fila `[D]`.

### 6.2 Crear sitio (`/sites/new`)

Página (no modal fijo), con indicador de pasos accesible (3 pasos, "Paso 2 de 3", `aria-current="step"`). Barra inferior fija: `Atrás` / `Siguiente`. `Salir` pide confirmación solo si hay datos.

```text
Crear sitio            Paso 1 de 3 · Cómo construirlo
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│ Sitio informativo │ │ Sitio con Catálogo│ │ Importar ZIP      │
│ Páginas, contacto │ │ Muestra productos │ │ Un sitio ya hecho │
│ y blog.           │ │ de tu Catálogo.   │ │ (HTML estático).  │
│ [Recomendado]     │ │                   │ │ No disponible aún │
└───────────────────┘ └───────────────────┘ └───────────────────┘
```

Paso 2: `TextField` nombre; `TextField` "¿A qué se dedica?" (opcional, alimenta `settings.giro`); color principal; fondo; tipografía; logo (`FileUploader` con opción "Usar el logo de mi empresa"). Paso 3: tarjetas de plantilla + `Empezar en blanco`; marcar páginas.
Validación en línea con React Hook Form + Zod; el nombre vacío bloquea `Siguiente` con mensaje en el campo. `siteType` se deriva de la tarjeta (informativo → `website`, con Catálogo → `ecommerce`); se puede cambiar luego en Configuración y se advierte que cambia los bloques disponibles.

### 6.3 Resumen del sitio (`/sites/:siteId/overview`)

```text
Cafetería La Esquina
┌ Estado ────────────────────────────────┐ ┌ Primeros pasos (3 de 7) ─────────────┐
│ Publicado · cambios sin publicar       │ │ [x] Elegir plantilla                  │
│ Versión actual: 2 nov, 14:30 · Ana     │ │ [x] Editar la página de inicio        │
│ Borrador: 5 cambios guardados desde    │ │ [ ] Conectar Catálogo   (opcional)    │
│ la última publicación                  │ │ [ ] Agregar formulario  (opcional)    │
│ [Ver versión pública] [Publicar]       │ │ [ ] Elegir dirección    (opcional)    │
└────────────────────────────────────────┘ └──────────────────────────────────────┘
Actividad reciente · Páginas (4) · Formularios (1) · Respuestas (12)
```

- Estadísticas como hoy (`StatCard`) pero **por sitio** y con enlaces a la sección.
- `Ver versión pública` solo si hay dirección lista (8.7); si no, texto "Todavía no tiene una dirección pública".
- "Cambios sin publicar": comparación `draftRevision` del sitio vs. `draftRevision` capturada en el release activo (campo del release, `schema.prisma` modelo `WebsiteRelease`). Recuento exacto de páginas cambiadas `[D]`: no se promete; se muestra "Hay cambios guardados sin publicar".

### 6.4 Páginas (`/sites/:siteId/pages`)

Tabla (`RunlyTable`) por sitio. Columnas: Título · Ruta · **En el sitio público** (Sí / No) · Última edición · Acciones.

- "En el sitio público" = la ruta aparece en el manifiesto del release activo (`GET release` detalle). No se muestra "Publicada/Borrador" por página, porque la publicación es del sitio. `[D]` Marcar "Editada desde la última publicación" por página requiere `documentHash` en el listado o la comparación con el manifiesto; hasta entonces no se muestra.
- Acciones por fila (`ActionMenu`): `Editar`, `Ajustes de la página` (título, ruta, SEO como `Sheet`), `Eliminar`.
- Se **elimina** el switch Publicar/Despublicar por página (P-02). Para sacar una página del sitio: `Ajustes` › "Ocultar al publicar" (visibilidad del borrador) + publicar; o eliminarla (con aviso).
- `Eliminar` una página que está en el sitio público: `ConfirmDialog` con texto "Esta página está en tu sitio público. Se quitará cuando publiques de nuevo; hasta entonces sigue visible." Requiere `website.pages.delete` y `website.pages.publish` (contratos §2.8); si falta uno, la acción se deshabilita con razón.
- `Nueva página`: `Dialog` md+ (título, ruta con vista previa de la URL, plantilla opcional). `409 route_conflict` marca el campo ruta: "Ya existe una página con esa ruta".
- Crear usa `Idempotency-Key`; ruta propuesta se normaliza y valida como el contrato (sin `..`, ≤512 bytes).

### 6.5 Editor de página (`/sites/:siteId/pages/:pageId/editor`)

Ruta **administrativa** (corrige P-04). Contenedor a pantalla completa bajo una barra superior propia (`EditorTopBar`); el motor ocupa el resto, como hoy (`position: fixed` con `topOffset`).

```text
‹ Páginas   Inicio · Cafetería La Esquina   [Borrador]     Guardado 14:32 ✓   [Vista previa] [Guardar] [Publicar ▸]
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  atlas-web-builder (paleta · lienzo · propiedades · deshacer/rehacer · escritorio/tablet/móvil)               │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Qué hace la barra y qué deja al motor**

- El motor conserva: paleta, árbol, propiedades por grupos, medios, **Deshacer/Rehacer**, selector de dispositivo. No se duplican.
- `brandName` pasa de "Runly ERP" al nombre del sitio (P-19); `siteType` real del sitio.
- **Indicador "Borrador"** siempre visible, con tooltip: "Lo que editas es privado. Tus visitantes ven la versión publicada hasta que publiques." Y enlace "Publicado: 2 nov, 14:30" si existe.
- `Vista previa del editor` (modo vista del motor) siempre disponible; `Vista previa del sitio` (release privado con grant temporal) **solo con capability S4** `[D]`.

**Estado de guardado (máquina de estados)**

| Estado | Texto | Cuándo |
|---|---|---|
| `clean` | "Guardado 14:32" | Último `PUT draft` correcto o recién cargado. |
| `dirty` | "Cambios sin guardar" | `[D]` requiere señal del motor (ver abajo). |
| `saving` | "Guardando…" (botón deshabilitado, `aria-busy`) | Durante `PUT .../draft`. |
| `error` | "No se pudo guardar · Reintentar" | 5xx/red; el contenido local se conserva. |
| `conflict` | Modal de conflicto (más abajo) | 409 `revision_conflict`. |
| `offline` | "Sin conexión · tus cambios se conservan en este equipo" | Falla de red; copia local en `sessionStorage` por `(companyId, siteId, pageId, revision)`. |

**Dependencia B-1 (paquete atlas-web-builder, cambio aditivo):** el editor solo emite `onSaveDraft(page)` y `onPublish(page)`. Para `dirty` y para avisar al salir hace falta un `onChange(page)` o `onDirtyChange(boolean)`. **Degradado sin B-1:** la barra muestra solo `saving/clean/error`, el botón `Guardar` siempre está activo, se incluye atajo y se avisa en el pie del panel "Guarda antes de salir". No se inventa un `dirty` por comparación periódica. Propuesta adicional B-2: prop `readOnly` para abrir una versión histórica; no es necesaria para el primer corte.

**Guardar:** `PUT /website/sites/:siteId/pages/:pageId/draft` con `{document, seo?, metadata?, expectedRevision}`. En 200 se actualiza `revision` y `documentHash` en memoria. **No hay autoguardado** en el primer corte (el CAS lo haría conflictivo y no hay `dirty` fiable); sí recordatorio al salir cuando B-1 exista.

**Conflicto 409 `revision_conflict`** (otra persona u otra pestaña guardó):

```text
┌ Esta página cambió mientras la editabas ─────────────────────────────┐
│ Otra persona (o otra pestaña) guardó una versión más reciente.        │
│ Tus cambios siguen aquí; no se ha sobrescrito nada.                   │
│                                                                       │
│ (•) Guardar mi versión como una página nueva                          │
│ ( ) Descartar mis cambios y cargar la versión guardada                │
│ ( ) Reemplazar la versión guardada con la mía  …pide confirmación     │
│                                            [Seguir editando] [Aceptar]│
└───────────────────────────────────────────────────────────────────────┘
```

Primera opción = crear página con `POST .../pages` + `PUT draft` con el documento local (no pierde nada, es la salida segura). La tercera exige `ConfirmDialog` y, internamente, vuelve a leer la revisión y repite el guardado **solo tras la elección explícita** (contratos §4: "no sobrescribir automáticamente"). No hay comparación visual en el primer corte `[D]`.

**Errores de autorización en el editor:** 403 al guardar (`permission_denied`): banner no descartable "No tienes permiso para guardar cambios en esta página", editor en modo vista (B-2) o con guardado deshabilitado. 401: se guarda copia local y se muestra el diálogo de sesión caducada del shell; al reautenticar se ofrece reintentar. 404: "Esta página ya no existe" con `Volver a Páginas`.

**Validación al abrir:** `GET .../draft` devuelve `issues`. `unknown_block_type`: banner "Esta página tiene bloques que ya no existen. Se conservan, pero no podrás publicar hasta resolverlos" con lista y enlace al bloque. `schema_unsupported`: el editor no abre; estado de error con explicación.

**Publicar desde el editor:** `onPublish` del motor ya no publica: ejecuta **guardar** (si procede) y abre la **hoja de publicación** (6.7). Es un cambio de significado del botón, sin tocar el motor.

### 6.6 Ajustes de página (`Sheet`)

Título, ruta (con URL resultante), visibilidad del borrador, SEO (título, descripción, imagen social) → `PUT draft` con `metadata` y `seo`. Texto fijo: "Estos cambios se aplican a tu sitio público cuando publiques." Cambio de ruta de una página que ya está en el sitio: aviso "La dirección anterior dejará de funcionar".

### 6.7 Hoja de publicación (`PublishSheet`, `Dialog` md+ con encabezado, cuerpo y pie fijos)

Flujo de tres estados; el pie nunca se mueve (regla de modales del proyecto).

**Estado A — Revisar**

```text
Publicar "Cafetería La Esquina"
Se publicará lo que tienes guardado. Los cambios sin guardar del editor no se incluyen.
[x] Todas las páginas guardadas (4)                [Elegir páginas]
[x] Incluir tema y menús
Versión actual: 2 nov, 14:30 · Ana
                                              [Cancelar]  [Preparar publicación]
```

- Por defecto **todo seleccionado** y "Elegir páginas" despliega las casillas (`publishPageIds`); es la opción avanzada. Primera publicación: tema y menús obligatorios (`includeThemeAndMenus` fijo, casilla deshabilitada con razón).
- Si hay cambios sin guardar en el editor, el estado A empieza con `Guardar y continuar`.

**Estado B — Preparando** (`POST .../releases` → 202; sondeo de `GET .../releases/:id` cada 1,5 s con tope)

Lista con spinner: "Comprobando páginas… Verificando imágenes… Sellando versión…". `aria-live="polite"`. Cancelar cierra la hoja; la preparación fallida o abandonada no tiene efecto público.

**Estado C — Listo para activar / Resultado**

```text
La versión está lista
4 páginas · tema y menús · verificada.
Al activar, tu sitio público cambiará a esta versión. Puedes volver a la anterior cuando quieras.
                                              [Volver]  [Activar versión]
```

Éxito: "Tu sitio está publicado" con enlace a la dirección **solo si el dominio está listo** (8.7); si no, "Publicado. Todavía no tiene una dirección pública activa; elígela en Dominios."

**Errores (mapeados; `failureCode` o `code`)**

| Código | Dónde se ve | Mensaje y acción |
|---|---|---|
| `draft_changed` (409) | Activar | "Se guardaron cambios mientras preparábamos esta versión." `Preparar de nuevo` (nueva clave). |
| `publication_conflict` (409) | Activar | "Otra persona publicó hace un momento." `Ver publicaciones` y recargar estado. |
| `idempotency_conflict` (409) | Cualquiera | Error de cliente: se descarta la clave y se vuelve a intentar con una nueva si el usuario lo pide. |
| `unknown_block_type`, `unknown_block_property`, `invalid_block_property` | Preparación | "Hay bloques que no se pueden publicar" + enlace a la página `[D]` (el release solo expone `failureCode`; ver 10.4). |
| `unsafe_link`, `unsafe_content`, `asset_not_publishable`, `asset_requires_pinning`, `asset_too_large`, `asset_type_mismatch` | Preparación | Mensaje por tipo: imagen no publicable (privada, externa o demasiado grande). |
| `route_conflict` | Preparación | "Dos páginas usan la misma dirección." |
| `form_scope_unresolved` (422) | Preparación | "Esta página usa un formulario que aún no se puede publicar." (8.4). |
| `dynamic_binding_unavailable` (422) | Preparación | "Esta página usa Calendar, aún no disponible en publicaciones." |
| `runtime_unavailable`, `dependency_unavailable`, `integrity_failed` (503) | Preparación/Activación | "El servicio de publicación no está disponible. Tu sitio actual no cambió." `Reintentar`. |
| `permission_denied` (403) | Cualquiera | "No tienes permiso para publicar." (el botón ya iba deshabilitado; esto cubre cambios de rol). |

Idempotencia: una clave nueva por intención (preparar, activar); los reintentos por red reutilizan la clave.

### 6.8 Publicaciones (`/sites/:siteId/publishing`)

```text
Versión publicada ahora
┌──────────────────────────────────────────────────────────────────────────┐
│ 2 nov 2026, 14:30 · Ana · 4 páginas              [Ver sitio] [Retirar sitio] │
└──────────────────────────────────────────────────────────────────────────┘
Historial de versiones
2 nov 14:30  Ana    Activa                       
31 oct 09:12 Luis   Anterior                        [Volver a esta versión]
30 oct 17:40 Ana    No se pudo preparar · por qué   (informativa)
```

- Lista con paginación por cursor (`GET .../releases?limit=25&cursor=`). Estados visibles: `Activa`, `Anterior`, `Preparada sin activar`, `No se pudo preparar`, `Revocada` (sin acción).
- **Volver a esta versión** (`rollback`): solo para releases `ready` previamente publicados. `ConfirmDialog`: "Tu sitio público volverá a la versión del 31 oct, 09:12. Tus borradores no se pierden." Errores: `rollback_not_published` ("Esa versión nunca estuvo publicada"), `release_not_ready`, 409 `publication_conflict`.
- **Retirar el sitio** (`unpublish`): `ConfirmDialog` destructivo, texto de consecuencias: "Tu sitio dejará de ser visible. No se borra nada: podrás publicarlo de nuevo." Casilla de confirmación explícita. Permiso `website.pages.publish`.
- **Archivar** vive en Configuración > Avanzado (6.12), no aquí.
- No se muestran números de versión inventados; se usa fecha y persona. `[D]` El nombre de la persona requiere resolver `actorId` (la fila trae `actorId`); se usa el directorio de usuarios de empresa existente.

### 6.9 Formularios (`/sites/:siteId/forms`)

Lista con `RunlyTable`: Nombre · Estado (Activo/Desactivado) · Campos · Respuestas · Última respuesta. Detalle `/forms/:formId` con pestañas:

1. **Campos**: lista ordenable de campos, `Agregar campo` (tipo, etiqueta, obligatorio, validaciones por tipo: largo, correo, teléfono, lista de opciones). Cambios se guardan con `expectedDefinitionRevision` `[D]`.
2. **Respuestas**: tabla paginada (`submissions.read`); fila abre `Sheet`. Texto fijo "Ver respuestas queda registrado en la auditoría". `Exportar` y `Eliminar` **no se muestran** hasta que su capability sea true (contratos §8: capability false hasta política de retención); si el usuario intenta, el backend responde 409 `retention_required`, que se muestra como "La eliminación de respuestas no está habilitada".
3. **Ajustes**: notificación por correo, responsable, crear lead, mensaje de éxito. **Antispam (honeypot/Turnstile) y modo paso a paso** en sección plegada "Avanzado" (P-15).

**Alta simplificada:** `Dialog` con solo Nombre y Plantilla de campos ("Contacto: nombre, correo, mensaje" / "En blanco"); el resto se configura después.

**Insertar en una página:** el bloque `Formulario` del editor deja de pedir un ID: se añade un **tipo de campo personalizado `formPicker`** (el motor admite tipos de campo personalizados, README sección 10) que lista formularios del sitio con `ComboboxField`. Mientras `form_scope_unresolved` siga activo, el selector muestra un aviso en el panel: "Podrás probar el formulario, pero no publicarlo todavía." (decisión D-2 en la sección 13). Sin permiso `forms.read` el selector queda vacío con razón.

Permisos y errores: 403 en lectura de respuestas → `EmptyState` "No tienes permiso para ver las respuestas"; el listado de formularios y la edición de campos tienen permisos separados (`forms.read/update`, `submissions.read`). Formularios de propietario Growth no administrables aquí: el servidor responde 409 `ambiguous_site_identifier`; se muestra "Este formulario pertenece a Growth" con enlace.

**Lo que no se diseña como disponible:** automatizaciones tras el envío, integración con Calendar y FormScope (propietario/analítica). Se documentan como dependencias (10.2).

### 6.10 Catálogo (`/sites/:siteId/catalog`)

Objetivo: elegir qué productos **ya existentes** se ven en el sitio, sin duplicarlos ni tocar el punto de venta.

```text
Catálogo en tu sitio                                    [Abrir Catálogo ↗]
La visibilidad en el sitio es independiente de la venta en punto de venta.
Buscar…    Categoría ▾    Mostrar: Todos | Visibles en el sitio | Ocultos
┌─────────────────────────────────────────────────────────────────────────────┐
│ [img] Café americano   Bebidas    $35   2 variantes   Visible en el sitio [●]│
│ [img] Galleta avena    Postres    $22                 Oculto            [○]│
└─────────────────────────────────────────────────────────────────────────────┘
```

- El interruptor es el **mismo `published` de Catálogo** (`publishProduct`); no es un campo nuevo de Website. Requiere el permiso de Catálogo correspondiente (se verifica la clave al implementar; no se asume aquí). Sin permiso: el interruptor es solo lectura con razón y el enlace "Abrir en Catálogo".
- Imágenes y variantes: miniatura principal + contador de variantes; detalle en `Sheet` de solo lectura.
- **Productos despublicados:** chip "Oculto" y, si algún bloque del sitio los usa por ID, aviso "Está en una página pero no se mostrará".
- Estados vacíos: sin productos ("Aún no tienes productos. [Ir a Catálogo]"); ninguno visible ("Ningún producto es visible en tu sitio todavía"); error de carga con `Reintentar`.
- En el editor, los bloques `Producto` / `Productos` usan **selectores** (producto, categoría) alimentados por la fachada de productos **filtrada por `published`** (corrige P-13) y marcan los no visibles como deshabilitados con razón.
- Listados y buscador: el bloque `Productos` expone en su panel: categoría, orden, cantidad y "Mostrar buscador" (según lo que el bloque ya soporte; no se agregan props sin acuerdo con quien mantenga los bloques). La consulta es en vivo; el contrato (§9) no congela precios ni existencias.
- Agotado: sigue visible (comportamiento vigente); la UI no lo oculta ni promete lo contrario.
- `[D]` No existe aún un contrato "selección por sitio" (qué productos aparecen en *qué sitio*): hoy `published` es global a la empresa. El diseño lo declara así y **no** muestra "visible solo en este sitio".

### 6.11 Apariencia (`/sites/:siteId/appearance`)

Pestañas `Tema`, `Menús`, `Plantillas`. Se conservan los editores actuales de color/tipografía y árbol de menú (`ThemeColorEditor`, `ThemeTypographyEditor`, `MenuItemTree`), con tres cambios: (1) ligados al `siteId` de la ruta; (2) cada guardado indica "Se aplicará al publicar" mediante un aviso fijo; (3) tema y menús sin revisión CAS en S2 `[D]`, por lo que no se promete detección de conflicto: se muestra "Última modificación por … hace …" y se refresca al enfocar.

### 6.12 Configuración (`/sites/:siteId/settings`)

Secciones con anclas (no pestañas largas), orden por frecuencia:

1. **Identidad:** nombre, tipo de sitio (con advertencia sobre bloques), logo, a qué se dedica. `PATCH /website/sites/:id` con `{identity, expectedRevision}`; 409 → "Este sitio cambió; recarga para ver la última versión".
2. **SEO por defecto.**
3. **Quién puede qué** (6.14).
4. **Avanzado** (plegado por defecto): correo del sitio (SMTP), antispam y analítica (Turnstile), pagos (enlace a la pantalla actual), **Archivar sitio**.

**Archivar sitio** (reemplaza "Eliminar", P-11): `ConfirmDialog` destructivo con confirmación escribiendo el nombre. Texto verdadero: "El sitio deja de publicarse y se oculta de tu lista. Sus páginas, formularios y respuestas se conservan." Requiere `site.update` + `pages.publish`. No existe "eliminar definitivamente" en el contrato; no se ofrece.

### 6.13 Dominios (`/sites/:siteId/domains`)

Muestra **la dirección del sitio**, no "configuración DNS".

```text
Dirección del sitio
┌─────────────────────────────────────────────────────────────────────┐
│ cafe-esquina.sitios.example.com            Reservada · en preparación │
│ Tu dirección ya es tuya, pero aún no está activa. No tienes que hacer nada. │
└─────────────────────────────────────────────────────────────────────┘
Elegir una dirección:  [ cafe-esquina ] .sitios.example.com    [Reservar]
Dominio propio   (Próximamente)
```

- Hoy el contrato solo permite reservar un **slug** en el espacio de nombres de plataforma (`POST .../domains {slug}`); la fila trae `hostname`, `kind`, `state`, `ready`. `ready:false` ⇒ nunca se muestra "Publicado con HTTPS" (contratos §4). Estados visibles: `Reservada · en preparación`, `Activa` (cuando `ready:true`), `No disponible` (`hostname_taken`, `hostname_reserved`, `namespace_unavailable`).
- Validación de slug en línea: 3–50 caracteres `[a-z0-9-]`, sin transliteración; error del servidor `hostname_taken`: "Esa dirección ya está en uso. Prueba con otra."
- **Dominio propio:** tarjeta deshabilitada "Próximamente" (`feature_unavailable`). No se muestran registros DNS ni verificación.
- Permiso: `website.domains.manage` + `website.site.update`; sin ellos, lectura solamente.

### 6.14 Quién puede qué (en Configuración)

**No hay permisos por sitio** (contratos §2.2: un permiso de empresa vale para todos los sitios de la empresa). El diseño lo dice con claridad: panel de solo lectura con la matriz "Rol → qué puede hacer en Sitio web" (Ver, Editar páginas, Publicar, Formularios y respuestas, Dominios), enlace a **Identidad** para cambiar roles y nota "Estos permisos aplican a todos los sitios de tu empresa". No se diseña compartir un sitio con una persona concreta. `[D]` Para leer la matriz hace falta un endpoint de permisos efectivos por rol; si no existe, la sección muestra solo "Tus permisos" (derivados de la sesión).

### 6.15 Importar ZIP (`/sites/:siteId/import`)

Visible solo en sitios de origen ZIP. Estados (contratos §7; backend S4 en curso `[D]`):

| Estado | Pantalla |
|---|---|
| Sin archivo | Zona de carga (`FileUploader`, `.zip`) + panel "Cómo preparar tu ZIP". |
| Archivo seleccionado | Nombre y tamaño, `Subir y validar`, `Cambiar archivo`. Valida tamaño máximo en cliente. |
| Validando | Barra de progreso de subida y luego "Validando archivos…" (`aria-live`). |
| Rechazado | Lista por entrada con razón humana (ruta, motivo); `Subir otro ZIP`. Sin URLs internas. |
| Importado | "Tu ZIP es válido: N archivos." Botón `Ver vista previa`. |
| Vista previa disponible | Iframe aislado con sandbox + vencimiento ("Disponible 15 min"); `Renovar`. |
| Preparado para publicar | Release `ready`; pasa por la **misma hoja de publicación** (6.7), `kind:'dist'`. |
| Publicado | Igual que un sitio de editor, con historial/rollback compartidos. |

- **Guía en lugar de logos:** "Este ZIP debe ser un sitio **ya compilado**: un `index.html` en la raíz (o en una única carpeta) más sus archivos estáticos. No se instala nada ni se ejecuta código de servidor." Lista de requisitos: nombres de archivos con huella (hash) recomendados, rutas, tamaño máximo, tipos no permitidos (`.env`, mapas de código, claves). **Sin logos de React, Astro o Next.js y sin afirmar compatibilidad** (P-14); si se mencionan, como "Si tu framework genera un sitio estático, súbelo desde su carpeta de salida; la compatibilidad no está certificada".
- Hasta que S4 cierre, backend responde 409 `isolation_required`: la pantalla muestra **estado informativo** "La importación de ZIP aún no está disponible en esta instalación" sin botón de subida, y el asistente deshabilita la tarjeta ZIP (J1).
- Errores: `import_rejected` (con lista), 413 (tamaño), 415 (tipo), `asset_path_conflict` (422): "Un archivo cambió pero conserva el mismo nombre; vuelve a compilar con nombres con huella", `routing` (MPA/SPA como selector con explicación en una línea).
- Los límites numéricos mostrados se leen del servidor (`policyVersion`); la interfaz no los codifica.

### 6.16 Estados globales de cada pantalla

Cada pantalla define, y la revisión de aceptación comprueba: **carga** (`LoadingState`/skeleton con forma), **vacío** (`EmptyState` con acción), **error** (`ErrorState` con `Reintentar`; muestra `requestId` plegado), **éxito** (toast `sonner` breve, no como único indicador de un estado persistente) y **sin permiso** (mensaje explicativo, no pantalla en blanco ni error genérico).

---

## 7. Componentes y patrones reutilizables

### 7.1 Ya en `@runly/ui` (se usan sin crear nada)

`PageHeader`, `RunlyTable` / `DataTable` (con vista tarjetas), `Dialog` / `DialogHeader` / `DialogFooter`, `Sheet`, `ConfirmDialog`, `DropdownMenu` / `ActionMenu`, `Tabs`, `SelectField`, `ComboboxField`, `CreatableComboboxField`, `TextField`, `TextareaField`, `SwitchField` / `Switch`, `FileUploader`, `AttachmentsPanel`, `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`, `StatCard`, `Badge`, `StatusPill`, `Alert`, `UnsavedChangesBar`, `SegmentedControl`, `Card`, `Tooltip`, `ActivityTimeline`. (Verificado por exportación en `packages/ui/src/index.js` y archivos de `components/`.)

### 7.2 Componentes nuevos específicos de Website (en `modules/runly.website/components/`)

Solo lo que no sirve a otros módulos. Cada uno con estados, teclado y tokens del sistema.

| Componente | Uso | Notas |
|---|---|---|
| `SiteContextBar` | Barra fija de contexto del sitio | Nombre, selector, chip de estado, Vista previa, Publicar. |
| `SiteStatusChip` | Chip de estado del sitio y de release | Un único mapa estado→texto/variante (8.1). Usa `StatusPill`/`Badge`. |
| `PublishSheet` | Flujo de publicar (6.7) | Máquina de estados A/B/C; sondeo con tope; claves de idempotencia. |
| `ReleaseHistoryList` | Historial y rollback (6.8) | Cursor, estados, acciones con confirmación. |
| `EditorTopBar` + `useDraftSave` | Barra del editor y guardado con CAS | Estados `clean/dirty/saving/error/conflict/offline`, copia local. |
| `ConflictDialog` | Conflicto 409 (6.5) | Tres salidas, la insegura con confirmación. |
| `SiteCreationProgress` | Progreso por pasos con reintento (J1) | Reutilizable en otros alta multipaso. |
| `DomainReadinessCard` | Estado de dirección (6.13) | Tres estados + pendiente. |
| `ImportStatusPanel` | Estados del ZIP (6.15) | Lista de rechazos por entrada. |
| `CapabilityGate` | Habilitar/deshabilitar con razón | `can`, `disabledReason`, `unavailable` (capability false). Una sola fuente de razones. |

### 7.3 Candidatos a `@runly/ui` (no se crean dentro del módulo si aplican a otros)

Por política UI-first del repositorio, se evalúan al implementar:

- `StepIndicator` (pasos accesibles) — hoy no existe un `Stepper` genérico (`NumberStepper` es otra cosa).
- `ProgressChecklist` (lista de pasos con estado y reintento).
- `ConfirmDialog` con **casilla de confirmación** o "escribe el nombre" (variante); documentar en `docs/ai-context/rme3-runtime-capabilities.md` si se agrega.

### 7.4 Patrones transversales

1. **Cliente de API único** `useWebsiteApi()` sobre el dominio Website del SDK (`listSites, createSite, saveSiteDraft, listPages, createPage, getDraft, saveDraft, listReleases, getRelease, prepareRelease, activateRelease, rollbackRelease, unpublishSite, reserveHostname, listDomains`), que sustituye las ≥10 copias de `apiFetch`. Normaliza errores a `{status, code, message, fields, retryable, requestId}`.
2. **Claves de consulta** `['website', companyId, siteId, recurso, ...]`; cambio de empresa cancela y limpia.
3. **`useIdempotentCommand`**: genera una clave por intención del usuario (16–200 caracteres), la conserva en reintentos por red y la renueva al cambiar el cuerpo.
4. **`useCapabilities(siteId)`**: hoy deriva de permisos de sesión y de las restricciones conocidas (ZIP, formularios); mañana lee `capabilities` del servidor (`[D]`, 10.2) sin cambiar a los consumidores.
5. **Mapa de errores** (`websiteErrors.js`): código → título, mensaje, acción y gravedad; único lugar con los textos de 6.7, 8.8.
6. **Zonas de acción destructiva**: siempre `ConfirmDialog`, texto con consecuencias reales, nunca `window.confirm`.

---

## 8. Estados y errores

### 8.1 Estado del sitio (chip)

| Estado | Condición | Texto | Variante |
|---|---|---|---|
| Borrador | `lifecycle=draft`, sin release activo, nunca publicado | "Borrador (sin publicar)" | neutro |
| Publicado | release activo y `draftRevision == release.draftRevision` | "Publicado" | éxito |
| Con cambios | release activo y `draftRevision > release.draftRevision` | "Publicado · cambios sin publicar" | advertencia |
| Retirado | `lifecycle=unpublished` | "Retirado" | atenuado |
| Mantenimiento | `lifecycle=maintenance` | "En mantenimiento" | información |
| Archivado | `lifecycle=archived` | "Archivado" | atenuado |

El chip **nunca** se calcula con timestamps; se usa `draftRevision` (contratos §4: comparación de hashes/revisiones, no solo timestamps). `[D]` Cuando exista `hasUnpublishedChanges` del servidor (que también cubre tema/menús) se usa ése.

### 8.2 Estado de una versión (release)

`preparing` ("Preparando…"), `ready` ("Lista"), `failed` ("No se pudo preparar" + causa), `revoked` ("Revocada"). "Activa" es la relación `site.activeReleaseId`, no un estado del release.

### 8.3 Estado de guardado de página

Ver tabla en 6.5.

### 8.4 Formularios, Calendar y Blog: capacidades bloqueadas

| Capacidad | Hoy (S3) | Diseño |
|---|---|---|
| Publicar páginas con formulario | `form_scope_unresolved` 422 al preparar | Aviso en el selector de formulario, y mensaje específico en la hoja de publicación. No se oculta la función de crear formularios. |
| Calendar/reservas en páginas | `dynamic_binding_unavailable` 422 | Los bloques de reserva muestran aviso "No disponible al publicar todavía". |
| Blog público | El administrador y la salida pública usan fuentes distintas (WR-13); `BlogIndexBlock` es un marcador | La sección Blog existe, pero no promete "lista de entradas en tu sitio". Publicación de entradas vía `publishPostIds` `[D]` validar de punta a punta antes de exponerla como lista. Se marca "Experimental" hasta cerrar WR-13. |

### 8.5 Importación (ZIP)

Ver 6.15.

### 8.6 Dirección

Estado de dominio (`state` + `ready`): `pending`/`ready:false` ⇒ "Reservada · en preparación"; `ready:true` ⇒ "Activa"; rechazos ⇒ errores 8.8. El texto "Publicado con HTTPS" no existe en la interfaz.

### 8.7 Cuándo mostrar el enlace público

Solo si hay release activo **y** un dominio con `ready:true`. En cualquier otro caso se explica por qué no hay enlace.

### 8.8 Catálogo de errores (frontend)

| Código / HTTP | Título | Tratamiento |
|---|---|---|
| 401 | "Tu sesión caducó" | Conservar copia local, reautenticar, ofrecer reintentar. |
| 403 `permission_denied` | "No tienes permiso" | Deshabilitar acción con razón; si ocurre tras la acción, banner persistente. Nunca mostrar datos del recurso. |
| 404 `resource_not_found` | "Ya no está disponible" | Volver a la lista de la sección. |
| 409 `revision_conflict` | "Esta página cambió" | `ConflictDialog` (6.5). |
| 409 `draft_changed` | "Se guardaron cambios" | `Preparar de nuevo` (6.7). |
| 409 `publication_conflict` | "Otra persona publicó" | Recargar estado + `Ver publicaciones`. |
| 409 `idempotency_conflict` | (interno) | Regenerar clave; no se muestra salvo que persista. |
| 409 `publication_requires_explicit_action` | "Usa Publicar" | Orientar al flujo correcto (sirve para clientes antiguos; la UI nueva no debería provocarlo). |
| 409 `isolation_required` | "No disponible en esta instalación" | Estado informativo, sin reintento. |
| 409 `retention_required` | "No habilitado" | Mensaje y sin reintento. |
| 409 `ambiguous_site_identifier` | "Este elemento pertenece a otra área" | Enlace a Growth. |
| 409 `route_conflict` | "Esa dirección ya existe" | Marca el campo ruta. |
| 409 `hostname_taken` / 422 `hostname_reserved` / `namespace_unavailable` | "Dirección no disponible" | Marca el campo, sugiere otra. |
| 400/422 `validation_failed` (+ `fields`) | (por campo) | Mensaje en el campo; resumen arriba si hay varios; foco al primero. |
| 413 / 415 | "Archivo demasiado grande / tipo no permitido" | Mensaje con límite leído del servidor. |
| 429 `rate_limited` | "Demasiados intentos" | Espera con cuenta atrás si hay `Retry-After`. |
| 503 `dependency_unavailable` | "Servicio no disponible" | `Reintentar`; aclarar que el sitio publicado no cambió. |
| Red | "Sin conexión" | Conservar trabajo; reintentar al reconectar. |
| 500 | "Algo salió mal" | `requestId` plegado para soporte. |

Todas las pantallas muestran el `requestId` solo en un detalle plegado "Información para soporte".

---

## 9. Adaptaciones móviles y tablet

| Zona | Escritorio (≥1024) | Tablet (640–1023) | Móvil (<640) |
|---|---|---|---|
| Navegación del sitio | Panel lateral fijo | Panel colapsable (icono + etiqueta al abrir) | `SelectField` de sección bajo la barra de contexto |
| `SiteContextBar` | Una fila | Una fila; `Vista previa` pasa a icono | Dos filas: nombre+estado / acciones; `Publicar` a ancho completo en una barra inferior fija |
| Mis sitios | Tabla | Tarjetas de 2 columnas | Tarjetas de 1 columna, acción principal flotante `Crear sitio` |
| Asistente | Tarjetas lado a lado | 2 columnas | 1 columna; botones `Atrás/Siguiente` fijos al fondo |
| Páginas | Tabla | Tabla con columnas secundarias ocultas | Lista de tarjetas con `ActionMenu` |
| Editor | Motor completo | Motor con paneles responsivos propios | Se permite abrir; barra compacta (estado + `Guardar` + `Publicar`); aviso inicial descartable "Para editar mejor usa una tablet o un equipo". El motor declara paneles responsivos; **la calidad de edición táctil en teléfono es un criterio de QA en dispositivo, no una afirmación** |
| Hoja de publicación | `Dialog` md | `Dialog` md | Hoja a pantalla completa con pie fijo |
| Historial | Tabla | Tabla | Lista con acción en `ActionMenu` |
| Formularios | Maestro-detalle | Maestro-detalle apilado | Lista → detalle en pantalla; pestañas con scroll horizontal |
| Dominios / ZIP | Dos columnas | Una columna | Una columna |

Reglas: gutter 16 px; objetivos táctiles ≥44 px; ningún scroll horizontal de página; encabezado y pie de modales/hojas **fijos**, solo el cuerpo hace scroll (regla del proyecto); modales con tamaño md o superior e icono en `DialogHeader`.

---

## 10. Contratos consumidos y dependencias

### 10.1 Contratos disponibles (S1–S3) que el diseño usa

| Necesidad | Contrato | Fuente |
|---|---|---|
| Listar sitios | `GET /website/sites` (`site.read`) | acta S2 |
| Crear sitio | `POST /website/sites` + `Idempotency-Key`; 201 `{data}` | acta S2 |
| Detalle / identidad | `GET/PATCH /website/sites/:siteId` con `{identity, expectedRevision}` | acta S2 |
| Páginas | `GET/POST /website/sites/:siteId/pages` | acta S2 |
| Borrador con revisión | `GET/PUT /website/sites/:siteId/pages/:pageId/draft` con `expectedRevision`, `documentHash`, `issues` | acta S2 |
| Tema por sitio | `GET /website/theme?siteId=` | acta S2 |
| Preparar/activar/rollback/retirar | `POST .../releases`, `.../publication/activate|rollback|unpublish` + clave | acta S3 |
| Historial/detalle | `GET .../releases`, `GET .../releases/:id` | acta S3 |
| Dominios | `GET/POST .../domains` (`{slug}`) | acta S3 |
| Permisos | `website.access`, `site.read/update`, `pages.*`, `theme.*`, `menus.*`, `dist.upload`, `domains.manage`, `forms.*`, `submissions.read/delete` | `feature-modules.js` |
| Errores | Los códigos de 8.8 | actas S1–S3 |
| SDK | `listSites, createSite, saveSiteDraft, listPages, createPage, getDraft, saveDraft, listReleases, getRelease, prepareRelease, activateRelease, rollbackRelease, unpublishSite, reserveHostname, listDomains` | actas S2/S3 |

Campos del release verificados en `prisma/schema.prisma`: `id, siteId, baseReleaseId, draftRevision, publicationRevision, state, manifest, manifestHash, failureCode, actorId, createdAt`. Campos de `WebsiteDomain`: `hostname, kind, state, ready`.

### 10.2 Dependencias abiertas (no diseñar como disponibles)

| ID | Dependencia | Responsable | Efecto en el diseño |
|---|---|---|---|
| D-1 | `SiteDTO` completo con `capabilities`, `blockers[]`, `hasUnpublishedChanges`, `primaryDomain`, `publicUrl` (contratos §4; **no implementado**) | Codex | Se deriva en cliente (8.1) con `useCapabilities`; sustituir sin tocar pantallas. |
| D-2 | `FormScope` persistido / `form_scope_unresolved` | Codex | Publicar páginas con formularios bloqueado; aviso en selector y hoja de publicación. |
| D-3 | Calendar `dynamic_binding_unavailable` | Codex | Bloques de reserva no publicables; aviso. |
| D-4 | API admin de formularios v1 con `expectedDefinitionRevision`, export, delete con retención | Codex | Sin CAS de definición; `Exportar`/`Eliminar` ocultos. |
| D-5 | S4: importación ZIP, vista previa aislada (`POST .../previews`), límites `policyVersion` | Codex (en curso) | Importar ZIP y `Vista previa del sitio` quedan tras capability; hoy `isolation_required`. |
| D-6 | Creación atómica de sitio con plantilla (contratos §5) | Codex | Orquestación cliente con reanudación (J1). |
| D-7 | CAS de tema y menús (S2 pendiente) | Codex | Sin detección de conflicto en Apariencia. |
| D-8 | Detalle de fallo de preparación por página/bloque (hoy solo `failureCode`) | Codex | El enlace a la página con problema depende de ello; sin él, mensaje general. |
| D-9 | Listado de páginas con `documentHash`/`publicState` (o equivalencia por manifiesto) | Codex | Sin indicador por página de "editada desde la última publicación". |
| D-10 | Selección de productos por sitio / contrato "Catálogo en sitio" | Codex + Catálogo | Visibilidad `published` global a la empresa; no se diseña "solo este sitio". |
| D-11 | Dominios propios, DNS/TLS, registro global entre instalaciones | Operación | Tarjeta "Próximamente"; nunca "HTTPS activo". |
| D-12 | Permisos efectivos por rol (para "Quién puede qué") | Codex | Si no existe, solo "Tus permisos". |
| B-1 | atlas-web-builder: `onChange`/`onDirtyChange` | Dueño del paquete (coordina Codex) | Sin él, guardado degradado (6.5). Cambio aditivo, sin rediseño. |
| B-2 | atlas-web-builder: `readOnly` | Idem | Necesario para abrir versiones históricas solo lectura; no bloquea el primer corte. |
| B-3 | Tipos de campo personalizados `formPicker` / `productPicker` | Claude (en `runlyBlocks/`, usando API existente del paquete) | No requiere cambios al paquete. |

### 10.3 Discrepancias registradas (este documento no edita los maestros)

| ID | Discrepancia | Propuesta |
|---|---|---|
| DS-1 | El editor sigue montado en `PublicWebsiteEntry` bajo `?edit=1` en el host público. S3 aísla el runtime público y el guardia de origen bloquea rutas administrativas desde hostnames públicos. No he verificado si ese camino sigue alcanzable bajo la configuración Nginx de S3. | Confirmar con Codex. El diseño asume que **no** y mueve el editor a una ruta administrativa. |
| DS-2 | Contratos v1 §4 describe `SiteDTO`, `hasUnpublishedChanges` y errores `{error:{code,...}}`; S2/S3 entregan fachadas existentes con sobres `{data}` y algunos `{error}` legacy (acta S1). | El cliente normaliza ambos sobres en `useWebsiteApi`. |
| DS-3 | Contratos §2 propone `website.submissions.export`; el manifiesto **no** lo declara (solo `submissions.read/delete`). | La UI no ofrece exportar; se revisa cuando se declare. |
| DS-4 | Contratos §6 dice que el cambio de fuente a dist exige además `site.update`, y S1 añade `pages.publish`; el flujo de ZIP combina 3 permisos. | `CapabilityGate` muestra qué permiso falta. |
| DS-5 | `feature-modules.js` describe "editor Puck" y etiquetas sin acentos ("Diseno", "Configuracion"). Es contenido de manifiesto (backend). | Registrar para corregir en la etapa de implementación, con coordinación. |
| DS-6 | Los textos de ayuda `help/runly.website/views/*.md` describen pantallas actuales (resumen, páginas, configuración…). | Actualizarlos en el mismo cambio que cada pantalla (coordinación). |
| DS-7 | `GET /website/site` legado devuelve un default fijo (acta S2); coexiste con el selector explícito nuevo. | Las rutas legacy redirigen al sitio predeterminado; la UI nueva nunca la usa. |

---

## 11. Plan de implementación frontend

Condición de entrada: contratos S4 estables o capability en `false`. Orden pensado para no construir pantallas sobre lo que backend aún no garantiza. Propiedad de archivos según el plan de Codex §4: `modules/runly.website/**`, `website/WebsitePageRenderer.jsx`, `EditorContextBar.jsx`, `runlyBlocks/**`; `shell/PublicWebsiteEntry.jsx` solo para separar el modo edición, coordinado.

| Fase | Contenido | Depende de | Cierre |
|---|---|---|---|
| F0 Fundaciones | Rutas por `siteId` + redirecciones legacy; `useWebsiteApi` (SDK), `websiteErrors`, claves de caché con empresa, `useIdempotentCommand`, `useCapabilities`, `CapabilityGate`, `SiteContextBar`, `SiteStatusChip`. Corrección de acentos y marca. | S1–S3 | Navegar entre dos sitios sin mezclar datos; tests de errores y claves. |
| F1 Sitios y creación | Mis sitios, asistente de 3 pasos con progreso reanudable, Resumen y Primeros pasos. Sin camino ZIP activo. | F0, D-6 (fallback) | Crear sitio sin tienda/dominio; reanudar tras fallo inyectado. |
| F2 Páginas y editor | Lista por sitio, Ajustes de página, ruta del editor, `EditorTopBar`, `useDraftSave`, `ConflictDialog`, modo degradado B-1. | F0; B-1 deseable | Guardar con CAS, conflicto sin pérdida, editor fuera del host público. |
| F3 Publicación | `PublishSheet`, Publicaciones (historial, rollback, retirar), claves y errores completos. | F2 | Publicar, 409 `draft_changed`, rollback y retirada verificados contra el laboratorio S3. |
| F4 Apariencia y Configuración | Tema/menús ligados al sitio; identidad con CAS; avanzado plegado; archivar; "Quién puede qué". | F0, D-7/D-12 | Sin controles que contradigan la retención (P-11). |
| F5 Formularios | Lista, campos, respuestas de solo lectura, alta simplificada, `formPicker`. | D-2, D-4 para publicar | Selector sin ID manual; estados bloqueados honestos. |
| F6 Catálogo | Sección Catálogo, `productPicker` filtrado por `published`, avisos de ocultos. | Catálogo (sin cambios) | Matriz published × POS comprobada en UI sin cambiar POS. |
| F7 Dominios, ZIP y vista previa | Dominios (slug), Importar ZIP, `Vista previa del sitio`. | **S4 cerrado**, D-5 | Estados reales de 6.15; sin frameworks prometidos. |
| F8 Calidad | Responsive 390/768/1440, tema claro/oscuro, teclado y lector de pantalla, rendimiento de listas, retirada de pantallas viejas y ayuda actualizada. | F1–F7 | Criterios de la sección 12. |

Pruebas por fase (enfoque ajustado, sin suites exhaustivas): lógica pura (`websiteErrors`, máquina de guardado, derivación de estado del chip, claves de idempotencia) con `node --test`; flujos de conflicto, publicación y reanudación con **Playwright contra el stack desechable local** (`.e2e`), **no contra una instalación existente**. Cada fase termina con lint, build web y revisión visual; el cierre de F8 ejecuta la lista de 12.

Riesgos de ejecución: (1) `WebsiteFormsScreen.jsx`, `WebsiteSettingsScreen.jsx` y `DistUploadPanel.jsx` superan 500 líneas; el plan de archivos mantiene el límite de 1000 dividiendo por sección; (2) coexistencia temporal de rutas viejas y nuevas: se retiran al cerrar F8; (3) cambios en `PublicWebsiteEntry.jsx` deben coordinarse con el runtime público de Codex (`public-release-entry.jsx`) para no editar el mismo archivo a la vez.

---

## 12. Criterios de aceptación visuales

Lista verificable; cada ítem se comprueba con capturas a 390 / 768 / 1440 px en claro y oscuro.

**Comprensión del estado**
1. En cualquier pantalla de un sitio se ve el **nombre del sitio** y su **estado** sin hacer scroll.
2. En el editor se ve "Borrador" de forma persistente y, si hay publicación, su fecha.
3. Ningún botón muestra un estado donde debería haber una acción (se corrige `Publicado` vs `Publicar`).
4. Ningún texto afirma "publicado", "HTTPS" o "dominio activo" mientras `ready` sea false.

**Flujos**
5. Crear un sitio informativo en ≤3 pasos, sin dominio ni Catálogo, y llegar al Resumen.
6. Un fallo inyectado en el paso de páginas deja un sitio recuperable con `Reintentar`, no un estado inconsistente.
7. Publicar sigue A→B→C; el pie del diálogo no se desplaza entre estados.
8. Un 409 `revision_conflict` muestra el diálogo y **no pierde** el contenido local; la opción de reemplazo requiere confirmación.
9. Rollback y Retirar muestran consecuencias reales y piden confirmación; ninguna usa diálogos nativos.
10. Archivar no dice "borra de forma permanente".

**Honestidad de capacidades**
11. Formularios, Calendar, ZIP, dominios propios y vista previa del sitio muestran estado "no disponible aún" o están ocultos según su capability; ninguno ofrece un botón que falle con 409 conocido.
12. No hay logos ni textos que prometan compatibilidad con React, Astro o Next.js.

**Sistema de diseño y accesibilidad**
13. Cero `<select>`, `<input>`, `<textarea>` nativos o diálogos nativos; todo con `@runly/ui`.
14. Colores solo por tokens (`hsl(var(--…))`); no quedan `red-200/700/400` fijos; contraste AA en ambos temas.
15. Todo es operable con teclado; foco visible; el foco entra al abrir un diálogo y regresa al disparador; los pasos del asistente usan `aria-current="step"`.
16. Estados dinámicos (guardado, preparación, errores de campo) se anuncian con `aria-live`; los errores de formulario enlazan con su campo.
17. Objetivos táctiles ≥44 px en móvil; sin scroll horizontal de página; encabezado y pie de modales fijos.
18. Cada pantalla tiene sus cinco estados (carga, vacío, error, éxito, sin permiso) comprobados.
19. Todo el texto de interfaz en español con acentos; el nombre de edición no se repite en código (se importa `RUNLY_EDITION_NAME` si aparece).
20. Cambiar de empresa o de sitio no muestra datos del anterior ni un destello de ellos.

---

## 13. Decisiones de diseño y preguntas para revisión

| # | Decisión | Estado |
|---|---|---|
| DD-1 | Publicar es una acción del **sitio** con hoja de revisión; desaparecen el switch del Resumen y el publicar por página. | Propuesta firme (contratos S3). |
| DD-2 | El editor se mueve a ruta administrativa y deja de vivir en la URL pública. | Propuesta; **confirmar DS-1 con Codex**. |
| DD-3 | Navegación del sitio como panel propio; el manifiesto se reduce a "Mis sitios". | Propuesta; cambia el manifiesto (backend) al implementar. |
| DD-4 | Sin autoguardado en el primer corte. | Propuesta; revisar cuando B-1 exista. |
| DD-5 | "Eliminar sitio" se renombra "Archivar" y no se ofrece purga. | Propuesta firme (S1). |
| DD-6 | Sin permisos por sitio; panel informativo "Quién puede qué". | Propuesta firme (contratos §2.2). |
| DD-7 | Dominio propio: tarjeta "Próximamente". | Propuesta firme. |
| DD-8 | Formularios se pueden crear y editar aunque aún no se puedan publicar en páginas; se avisa. | **Decisión abierta (D-2 abajo).** |

**Preguntas que necesito resolver antes de implementar**

1. **DS-1:** ¿El modo edición en el host público sigue alcanzable tras S3, y se acepta moverlo a una ruta administrativa?
2. **DD-8:** ¿Prefieres (a) permitir insertar formularios en el editor con aviso de que no se publican todavía, o (b) ocultar el bloque Formulario hasta cerrar FormScope? Recomiendo (a): el usuario avanza y el aviso es honesto.
3. **B-1/B-2:** ¿Quién y cuándo puede añadir `onChange`/`onDirtyChange` (y `readOnly`) a atlas-web-builder? Sin ello el indicador "Cambios sin guardar" no es fiable.
4. **D-1:** ¿Se publicará `capabilities`/`hasUnpublishedChanges` en el listado de sitios, o el cliente debe derivarlo siempre?
5. **D-8:** ¿El release puede exponer en `validationReport`/detalle la página y el bloque que impiden publicar?
6. **D-10:** ¿Se prevé una selección de productos por sitio, o `published` seguirá siendo global a la empresa?
7. **S4:** ¿Los límites y la `policyVersion` de importación se pueden leer del servidor para mostrarlos sin codificarlos?

---

## 14. Evidencia disponible y alcance de esta auditoría

**Leído:** maestro, contratos v1, plan, actas S1/S2/S3 (`docs/superpowers/evidence/2026-11-02-website-recovery/`); manifiesto `runly.website`; `WebsiteOverviewScreen`, `WebsitePageEditorScreen`, `WebsiteWizard` (completo hasta el paso de creación), `WebsitePagesScreen`, `WebsiteFormsScreen`, `WebsiteSettingsScreen`, `DistUploadPanel`, `EditorContextBar`, `PublicWebsiteEntry` (zona de edición) y `public-release-entry.jsx`; README y `dist/` de `@raulbellosom/atlas-web-builder` 0.2.0 (instalado); modelos `WebsiteRelease` y `WebsiteDomain` en `prisma/schema.prisma`; exportaciones de `@runly/ui`.

**No hecho (límites honestos):**
- **No se ejecutó la aplicación ni se tomaron capturas**: no se arrancó servidor ni navegador (los servidores locales no se tocan y el repositorio principal está en uso por S4). Los hallazgos de esta versión se basan en **lectura de código y actas**, no en observación visual. La auditoría visual (tema oscuro, responsive real, jerarquía visual) queda pendiente de capturas en un stack desechable (`.e2e`).
- No se leyeron en detalle `WebsiteBlogScreen`, `WebsiteMenusScreen`, `WebsiteThemeScreen`, `WebsitePaymentsScreen`, `TemplatePreviewScreen` ni los pasos individuales del asistente más allá de lo citado; sus diseños de 6.11 se basan en su rol y en las actas.
- No se evaluó atlas-web-builder 0.2.4 ni el checkout externo; el diseño asume 0.2.0 (instalado) y propone cambios aditivos solo como dependencias.
- Estimaciones de esfuerzo no incluidas: dependen de qué dependencias de 10.2 cierren.

**Archivos de este entregable**
- Creado: `docs/superpowers/design/2026-11-02-website-ux.md` (este documento).
- No se modificó ningún otro archivo. Rama `design/website-ux` en el worktree independiente, creada desde `efce9ea5586340a53920f0561b74bc38d0919fab`.
